import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../common/app-exception';
import { isUniqueViolation } from '../common/db-errors';
import { UserEntity, WorkspaceEntity, WorkspaceMemberEntity, WorkspaceRole } from '../database/entities';

const view = (w: WorkspaceEntity, role: WorkspaceRole) => ({
  id: w.id,
  name: w.name,
  role,
  creditBalance: w.creditBalance,
  createdAt: w.createdAt,
});

@Injectable()
export class WorkspacesService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async create(userId: string, name: string) {
    return this.ds.transaction(async (m) => {
      const w = await m.save(WorkspaceEntity, m.create(WorkspaceEntity, { name, createdBy: userId }));
      await m.save(WorkspaceMemberEntity, m.create(WorkspaceMemberEntity, { userId, workspaceId: w.id, role: 'admin' }));
      return view(w, 'admin');
    });
  }

  async listMine(userId: string) {
    const rows = await this.ds
      .getRepository(WorkspaceMemberEntity)
      .find({ where: { userId }, relations: { workspace: true }, order: { createdAt: 'ASC' } });
    return rows.map((r) => view(r.workspace, r.role));
  }

  async get(workspaceId: string, role: WorkspaceRole) {
    const w = await this.ds.getRepository(WorkspaceEntity).findOne({ where: { id: workspaceId } });
    if (!w) throw new AppException('WORKSPACE_NOT_FOUND', 404);
    return view(w, role);
  }

  async rename(workspaceId: string, name: string) {
    await this.ds.getRepository(WorkspaceEntity).update({ id: workspaceId }, { name });
    return this.get(workspaceId, 'admin');
  }

  async listMembers(workspaceId: string) {
    const rows = await this.ds
      .getRepository(WorkspaceMemberEntity)
      .find({ where: { workspaceId }, relations: { user: true }, order: { createdAt: 'ASC' } });
    return rows.map((r) => ({ userId: r.userId, email: r.user.email, displayName: r.user.displayName, role: r.role, joinedAt: r.createdAt }));
  }

  async addMember(workspaceId: string, email: string, role: WorkspaceRole) {
    const user = await this.ds.getRepository(UserEntity).findOne({ where: { email: email.toLowerCase() } });
    if (!user) throw new AppException('MEMBER_USER_NOT_FOUND', 404, { email });
    try {
      await this.ds.getRepository(WorkspaceMemberEntity).save({ workspaceId, userId: user.id, role });
    } catch (e) {
      if (isUniqueViolation(e, 'uq_workspace_members')) throw new AppException('MEMBER_ALREADY_EXISTS', 409);
      throw e;
    }
    return { userId: user.id, email: user.email, displayName: user.displayName, role };
  }

  async changeRole(workspaceId: string, userId: string, role: WorkspaceRole) {
    await this.ds.transaction(async (m) => {
      const member = await this.lockMember(m, workspaceId, userId);
      if (member.role === 'admin' && role !== 'admin') await this.assertNotLastAdmin(m, workspaceId);
      await m.update(WorkspaceMemberEntity, { id: member.id }, { role });
    });
    return { userId, role };
  }

  async removeMember(workspaceId: string, userId: string) {
    await this.ds.transaction(async (m) => {
      const member = await this.lockMember(m, workspaceId, userId);
      if (member.role === 'admin') await this.assertNotLastAdmin(m, workspaceId);
      await m.delete(WorkspaceMemberEntity, { id: member.id });
    });
  }

  private async lockMember(m: EntityManager, workspaceId: string, userId: string) {
    // Khóa toàn bộ admin của workspace để hai thao tác song song không cùng hạ admin cuối cùng.
    await m
      .createQueryBuilder(WorkspaceMemberEntity, 'x')
      .setLock('pessimistic_write')
      .where('x.workspaceId = :workspaceId', { workspaceId })
      .getMany();
    const member = await m.findOne(WorkspaceMemberEntity, { where: { workspaceId, userId } });
    if (!member) throw new AppException('MEMBER_NOT_FOUND', 404);
    return member;
  }

  private async assertNotLastAdmin(m: EntityManager, workspaceId: string) {
    const admins = await m.count(WorkspaceMemberEntity, { where: { workspaceId, role: 'admin' } });
    if (admins <= 1) throw new AppException('MEMBER_LAST_ADMIN', 409);
  }
}
