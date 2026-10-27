import sys, re, json, concurrent.futures as cf, requests, fsspec, pyarrow.parquet as pq, pyarrow as pa
B="https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com"; R="release/2026-09-23.1"
X0,X1,Y0,Y1 = -72.675,-72.615,7.345,7.412
def keys(t):
    out=[]; token=None
    while True:
        u=f"{B}/?list-type=2&prefix={R}/{t}/"+(f"&continuation-token={requests.utils.quote(token)}" if token else "")
        x=requests.get(u,timeout=60).text
        out+=re.findall(r"<Key>([^<]*)</Key>",x)
        m=re.search(r"<NextContinuationToken>([^<]*)<",x)
        if not m: return out
        token=m.group(1)
fs=fsspec.filesystem("http", block_size=2**20)
def scan(key):
    url=f"{B}/{key}"
    with fs.open(url,"rb") as f:
        pf=pq.ParquetFile(f)
        md=pf.metadata; names=[md.schema.column(i).path for i in range(md.num_columns)]
        ix={n:names.index(n) for n in ["bbox.xmin","bbox.xmax","bbox.ymin","bbox.ymax"]}
        rgs=[]
        for r in range(md.num_row_groups):
            rg=md.row_group(r); st={k:rg.column(i).statistics for k,i in ix.items()}
            if any(s is None or not s.has_min_max for s in st.values()): rgs.append(r); continue
            if st["bbox.xmax"].max < X0 or st["bbox.xmin"].min > X1 or st["bbox.ymax"].max < Y0 or st["bbox.ymin"].min > Y1: continue
            rgs.append(r)
        if not rgs: return None
        t=pf.read_row_groups(rgs)
    bb=t.column("bbox").combine_chunks()
    xmin=bb.field("xmin").to_numpy(zero_copy_only=False); xmax=bb.field("xmax").to_numpy(zero_copy_only=False)
    ymin=bb.field("ymin").to_numpy(zero_copy_only=False); ymax=bb.field("ymax").to_numpy(zero_copy_only=False)
    import numpy as np
    m=(xmax>=X0)&(xmin<=X1)&(ymax>=Y0)&(ymin<=Y1)
    if not m.any(): return None
    return t.filter(pa.array(m))
def run(t, name):
    ks=keys(t); print(name, len(ks), "files", flush=True)
    tabs=[]
    with cf.ThreadPoolExecutor(16) as ex:
        for r in ex.map(scan, ks):
            if r is not None and r.num_rows: tabs.append(r)
    if not tabs: print(name,"0 rows"); return
    tab=pa.concat_tables(tabs, promote_options="permissive")
    pq.write_table(tab, f"data/{name}.parquet"); print(name, tab.num_rows, "rows", flush=True)
for t,n in [("theme=places/type=place","places"),("theme=divisions/type=division_area","division_area"),("theme=transportation/type=segment","segments"),("theme=base/type=land_use","land_use"),("theme=base/type=water","water"),("theme=base/type=infrastructure","infrastructure"),("theme=base/type=land","land"),("theme=buildings/type=building","buildings")]:
    if len(sys.argv)>1 and n not in sys.argv[1:]: continue
    try: run(t,n)
    except Exception as e: print(n,"ERROR",e)
