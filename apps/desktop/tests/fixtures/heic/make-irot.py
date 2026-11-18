import struct, sys
src, dst, angle = sys.argv[1], sys.argv[2], int(sys.argv[3])
d=bytearray(open(src,'rb').read())
def find(parent_off,parent_end,typ,hdr=8,skip=0):
    off=parent_off+hdr+skip
    while off<parent_end:
        size,t=struct.unpack('>I4s',d[off:off+8])
        if t==typ: return off,size
        off+=size
    raise Exception(typ)
meta_off,meta_size=find(0,len(d),b'meta',hdr=0)
iprp_off,iprp_size=find(meta_off,meta_off+meta_size,b'iprp',skip=4)
ipco_off,ipco_size=find(iprp_off,iprp_off+iprp_size,b'ipco')
ipma_off=ipco_off+ipco_size; ipma_size=struct.unpack('>I',d[ipma_off:ipma_off+4])[0]; assert d[ipma_off+4:ipma_off+8]==b'ipma'
iloc_off,iloc_size=find(meta_off,meta_off+meta_size,b'iloc',skip=4)
ver_flags=struct.unpack('>I',d[ipma_off+8:ipma_off+12])[0]
cnt=struct.unpack('>I',d[ipma_off+12:ipma_off+16])[0]
assert ver_flags==0 and cnt==1
ac_off=ipma_off+16+2
props=0; o=ipco_off+8
while o<ipco_off+ipco_size:
    s,_=struct.unpack('>I4s',d[o:o+8]); props+=1; o+=s
irot=struct.pack('>I4sB',9,b'irot',angle)
d.insert(ipma_off+ipma_size, 0x80|(props+1))
d[ac_off]+=1
d[ipma_off:ipma_off+4]=struct.pack('>I',ipma_size+1)
d[ipco_off+ipco_size:ipco_off+ipco_size]=irot
d[ipco_off:ipco_off+4]=struct.pack('>I',ipco_size+9)
d[iprp_off:iprp_off+4]=struct.pack('>I',iprp_size+10)
d[meta_off:meta_off+4]=struct.pack('>I',meta_size+10)
delta=10
v=d[iloc_off+8]
b=d[iloc_off+12]; c=d[iloc_off+13]
off_size=b>>4; len_size=b&15; base_size=c>>4; idx_size=(c&15) if v in (1,2) else 0
p=iloc_off+14
item_count=struct.unpack('>H',d[p:p+2])[0]; p+=2
assert item_count==1
p+=2
if v in (1,2): p+=2
p+=2
base=int.from_bytes(d[p:p+base_size],'big') if base_size else 0
if base_size:
    d[p:p+base_size]=(base+delta).to_bytes(base_size,'big')
p+=base_size
ext_count=struct.unpack('>H',d[p:p+2])[0]; p+=2
for i in range(ext_count):
    if idx_size: p+=idx_size
    if not base_size:
        eo=int.from_bytes(d[p:p+off_size],'big')
        d[p:p+off_size]=(eo+delta).to_bytes(off_size,'big')
    p+=off_size+len_size
open(dst,'wb').write(d)
