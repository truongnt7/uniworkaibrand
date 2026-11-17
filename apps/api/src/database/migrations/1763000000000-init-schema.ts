import { MigrationInterface, QueryRunner } from 'typeorm';

/** Schema khởi tạo: định danh, workspace, catalog (product/asset/template), thư viện nội dung, billing thủ công, runtime manifest. */
export class InitSchema1763000000000 implements MigrationInterface {
  name = 'InitSchema1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(254) NOT NULL, "password_hash" character varying(255) NOT NULL, "display_name" character varying(120) NOT NULL, "is_platform_admin" boolean NOT NULL DEFAULT false, "locale" character varying(8) NOT NULL DEFAULT 'vi', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email") `);
    await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "family_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "user_agent" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "ix_refresh_tokens_user" ON "refresh_tokens" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "ix_refresh_tokens_family" ON "refresh_tokens" ("family_id") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_refresh_tokens_hash" ON "refresh_tokens" ("token_hash") `);
    await queryRunner.query(`CREATE TABLE "workspaces" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(120) NOT NULL, "created_by" uuid, "credit_balance" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_workspaces_credit_non_negative" CHECK ("credit_balance" >= 0), CONSTRAINT "PK_098656ae401f3e1a4586f47fd8e" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "workspace_members" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "workspace_id" uuid NOT NULL, "role" character varying(16) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_workspace_members" UNIQUE ("workspace_id", "user_id"), CONSTRAINT "ck_workspace_members_role" CHECK ("role" IN ('admin','member')), CONSTRAINT "PK_22ab43ac5865cd62769121d2bc4" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "ix_workspace_members_user" ON "workspace_members" ("user_id") `);
    await queryRunner.query(`CREATE TABLE "plans" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "code" character varying(64) NOT NULL, "name" character varying(120) NOT NULL, "description" text, "price_vnd" bigint NOT NULL DEFAULT '0', "credits_included" integer NOT NULL DEFAULT '0', "duration_days" integer, "seat_limit" integer, "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3720521a81c7c24fe9b7202ba61" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_plans_code" ON "plans" ("code") `);
    await queryRunner.query(`CREATE TABLE "invoices" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL, "plan_id" uuid, "amount_vnd" bigint NOT NULL, "reference" character varying(64) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'pending', "note" text, "paid_at" TIMESTAMP WITH TIME ZONE, "confirmed_by" uuid, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_invoices_status" CHECK ("status" IN ('pending','paid','canceled')), CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_invoices_reference" ON "invoices" ("reference") `);
    await queryRunner.query(`CREATE INDEX "ix_invoices_workspace" ON "invoices" ("workspace_id") `);
    await queryRunner.query(`CREATE TABLE "subscriptions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL, "plan_id" uuid NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'active', "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE, "invoice_id" uuid, "note" text, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_subscriptions_status" CHECK ("status" IN ('active','canceled','expired')), CONSTRAINT "PK_a87248d73155605cf782be9ee5e" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "ix_subscriptions_workspace" ON "subscriptions" ("workspace_id", "status") `);
    await queryRunner.query(`CREATE TABLE "credit_ledger" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL, "delta" integer NOT NULL, "balance_after" integer NOT NULL, "kind" character varying(16) NOT NULL, "reason" text NOT NULL, "invoice_id" uuid, "actor_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_credit_ledger_delta" CHECK ("delta" <> 0), CONSTRAINT "ck_credit_ledger_kind" CHECK ("kind" IN ('purchase','grant','adjustment','usage','refund')), CONSTRAINT "PK_7ff08f655cf2f4d118c116571db" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "ix_credit_ledger_workspace" ON "credit_ledger" ("workspace_id", "created_at") `);
    await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "actor_user_id" uuid, "workspace_id" uuid, "action" character varying(64) NOT NULL, "entity_type" character varying(64) NOT NULL, "entity_id" character varying(64), "before" jsonb, "after" jsonb, "reason" text, "ip" character varying(64), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "ix_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id") `);
    await queryRunner.query(`CREATE INDEX "ix_audit_logs_workspace" ON "audit_logs" ("workspace_id", "created_at") `);
    await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL, "sku" character varying(64) NOT NULL, "name" character varying(200) NOT NULL, "category" character varying(120), "brand" character varying(120), "width_mm" numeric(8,2), "depth_mm" numeric(8,2), "height_mm" numeric(8,2), "brand_colors" text array NOT NULL DEFAULT '{}', "model_status" character varying(16) NOT NULL DEFAULT 'none', "cover_asset_id" uuid, "device_id" character varying(64), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_products_model_status" CHECK ("model_status" IN ('none','generating','ready')), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "ix_products_workspace_updated" ON "products" ("workspace_id", "updated_at") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_products_workspace_sku" ON "products" ("workspace_id", "sku") WHERE "deleted_at" IS NULL`);
    await queryRunner.query(`CREATE TABLE "assets" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL, "product_id" uuid NOT NULL, "kind" character varying(16) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'pending', "filename" character varying(255) NOT NULL, "content_type" character varying(127) NOT NULL, "size_bytes" bigint NOT NULL, "sha256" character varying(64), "cloud_key" character varying(512) NOT NULL, "etag" character varying(128), "meta" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_assets_status" CHECK ("status" IN ('pending','ready')), CONSTRAINT "ck_assets_kind" CHECK ("kind" IN ('photo','glb','label','logo','music','prop')), CONSTRAINT "PK_da96729a8b113377cfb6a62439c" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_assets_cloud_key" ON "assets" ("cloud_key") `);
    await queryRunner.query(`CREATE INDEX "ix_assets_product" ON "assets" ("workspace_id", "product_id") `);
    await queryRunner.query(`CREATE TABLE "templates" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "workspace_id" uuid, "owner" character varying(16) NOT NULL, "kind" character varying(16) NOT NULL, "name" character varying(200) NOT NULL, "category" character varying(120), "style" character varying(64), "aspect_ratios" text array NOT NULL DEFAULT '{}', "preset_id" character varying(120) NOT NULL, "blend_cloud_key" character varying(512), "components" jsonb NOT NULL DEFAULT '[]', "params" jsonb NOT NULL DEFAULT '{}', "license" character varying(255), "source" character varying(255), "version" integer NOT NULL DEFAULT '1', "published" boolean NOT NULL DEFAULT true, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_templates_owner" CHECK (("owner" = 'system' AND "workspace_id" IS NULL) OR ("owner" = 'workspace' AND "workspace_id" IS NOT NULL)), CONSTRAINT "ck_templates_kind" CHECK ("kind" IN ('image','video')), CONSTRAINT "PK_515948649ce0bbbe391de702ae5" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "ix_templates_kind_category" ON "templates" ("kind", "category") `);
    await queryRunner.query(`CREATE INDEX "ix_templates_workspace" ON "templates" ("workspace_id") `);
    await queryRunner.query(`CREATE TABLE "content_folders" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL, "parent_id" uuid, "name" character varying(120) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cd63e7467b5d0f9b6cf274d9d44" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "ix_content_folders_workspace" ON "content_folders" ("workspace_id") `);
    await queryRunner.query(`CREATE TABLE "contents" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL, "product_id" uuid NOT NULL, "project_version_id" uuid, "series_id" uuid NOT NULL, "version_no" integer NOT NULL DEFAULT '1', "kind" character varying(16) NOT NULL, "name" character varying(200) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'rendering', "progress" integer NOT NULL DEFAULT '0', "format" character varying(32), "size_bytes" bigint, "duration_ms" integer, "width" integer, "height" integer, "cloud_key" character varying(512), "folder_id" uuid, "tags" text array NOT NULL DEFAULT '{}', "favorite" boolean NOT NULL DEFAULT false, "device_id" character varying(64), "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_contents_series_version" UNIQUE ("series_id", "version_no"), CONSTRAINT "ck_contents_progress" CHECK ("progress" BETWEEN 0 AND 100), CONSTRAINT "ck_contents_status" CHECK ("status" IN ('rendering','ready','failed')), CONSTRAINT "ck_contents_kind" CHECK ("kind" IN ('image','video')), CONSTRAINT "PK_b7c504072e537532d7080c54fac" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "ix_contents_folder" ON "contents" ("folder_id") `);
    await queryRunner.query(`CREATE INDEX "ix_contents_product" ON "contents" ("product_id") `);
    await queryRunner.query(`CREATE INDEX "ix_contents_workspace_updated" ON "contents" ("workspace_id", "updated_at") `);
    await queryRunner.query(`CREATE TABLE "runtime_releases" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "channel" character varying(32) NOT NULL DEFAULT 'stable', "manifest" jsonb NOT NULL, "is_active" boolean NOT NULL DEFAULT false, "note" text, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e1c2ab93fdb23af1332420f5b3d" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_runtime_releases_active" ON "runtime_releases" ("channel") WHERE "is_active" = true`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "workspace_members" ADD CONSTRAINT "FK_4e83431119fa585fc7aa8b817db" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "workspace_members" ADD CONSTRAINT "FK_4a7c584ddfe855379598b5e20fd" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "FK_029d141be7ee764c2465186539e" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_c2976f4d947944d7cac1c98ecc4" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_e45fca5d912c3a2fab512ac25dc" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "credit_ledger" ADD CONSTRAINT "FK_f3373b7a0540bc381631132e9c6" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_e2f7cafd00ba25aa07eec2ac911" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "assets" ADD CONSTRAINT "FK_7813a359043fb3a80f331bc3f3d" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "assets" ADD CONSTRAINT "FK_40915c2c706b99e218ce1541342" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "templates" ADD CONSTRAINT "FK_8cdf85d2789b13aab53c70d4ecd" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "content_folders" ADD CONSTRAINT "FK_5f7c86a1d8f43fb249e9d18571b" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "content_folders" ADD CONSTRAINT "FK_2151351071baf6d5d3a668d5554" FOREIGN KEY ("parent_id") REFERENCES "content_folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "contents" ADD CONSTRAINT "FK_ba2881414ee0f256251aec42b69" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "contents" ADD CONSTRAINT "FK_2973e124e62215ee6c50124bcf6" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "contents" ADD CONSTRAINT "FK_2130f351b15f71758606382ba21" FOREIGN KEY ("folder_id") REFERENCES "content_folders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "ck_users_email_lower" CHECK ("email" = lower("email"))`);
    await queryRunner.query(`CREATE INDEX "ix_contents_tags" ON "contents" USING GIN ("tags")`);

    // Sổ cái credit và audit log là bất biến: chặn sửa/xóa ở tầng DB.
    await queryRunner.query(`
      CREATE FUNCTION aps_forbid_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`CREATE TRIGGER trg_credit_ledger_immutable BEFORE UPDATE OR DELETE ON "credit_ledger" FOR EACH ROW EXECUTE FUNCTION aps_forbid_mutation()`);
    await queryRunner.query(`CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION aps_forbid_mutation()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_credit_ledger_immutable ON "credit_ledger"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "runtime_releases" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contents" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "content_folders" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "templates" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "assets" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_ledger" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invoices" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plans" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_members" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspaces" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS aps_forbid_mutation()`);
  }
}
