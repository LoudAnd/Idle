import re,itertools,collections
from math import comb
exec(open('tr.py').read().split("tests={")[0].replace("cands=open('cands.txt').read().split()","cands=open('final.txt').read().split()"))
F=cands
# cross-ref graph: any A-number mention in any line, undirected
txts={a:open(f"{O}/seq/{a[:4]}/{a}.seq",encoding='utf-8').read() for a in F}
S=set(F); und=set()
for a in F:
    for b in set(re.findall(r'A\d{6}',txts[a]))&S:
        if b!=a: und.add(tuple(sorted((a,b))))
adj=collections.defaultdict(set)
for a,b in und: adj[a].add(b); adj[b].add(a)
print('edges',len(und),'isolated',[a for a in F if not adj[a]])
# components
seen=set();comps=[]
for a in F:
    if a in seen: continue
    st=[a];c=set()
    while st:
        x=st.pop()
        if x in c: continue
        c.add(x); st+=list(adj[x])
    seen|=c; comps.append(c)
print('components sizes',sorted(len(c) for c in comps))
print('small comps',[sorted(c) for c in comps if len(c)<5])
# transform closure
def ops(a):
    off,t=D[a]; out={}
    t=t[:24]
    out['S']=psum(t); out['Δ']=diff(t); out['B']=binom(t); out['B⁻¹']=ibinom(t)
    if all(x!=0 for x in t[:12]): out['Π']=pprod(t[:16])
    u=t if off>=1 else t[1:]
    if all(x>=0 for x in u) and max(u[:16])<10**30:
        out['E']=euler(u[:20]); out['EXP']=expt(u[:16]); out['IM']=invmob(u); out['M']=mob(u)
    for v in (0,1,2): out[f'pos{v}']=positions(D[a][1],off,v)
    out['nz']=[i+off for i,x in enumerate(D[a][1]) if x!=0]
    if all(y>x for x,y in zip(t,t[1:])) and t[0]>=0 and max(t[:20])<5000: out['comp']=complement(D[a][1]); out['cnt']=counting(D[a][1])
    out['+1']=[x+1 for x in t]; out['−1']=[x-1 for x in t]; out['sq']=[x*x for x in t]
    return out
edges=collections.defaultdict(list)
for a in F:
    try: o=ops(a)
    except Exception as e: print('err',a,e); continue
    for k,v in o.items():
        if len(v)<12: continue
        for b in match(v):
            if b!=a: edges[a].append((k,b))
reach={'A000012','A000027'}; frontier=list(reach)
while frontier:
    x=frontier.pop()
    for k,b in edges[x]:
        if b not in reach: reach.add(b); frontier.append(b)
print('transform edges',sum(len(v) for v in edges.values()))
print('reachable from seeds',len(reach))
print('unreached',sorted(S-reach))
for a in ['A000012','A000027','A000040','A000045','A000079','A000108']:
    print(a, edges[a][:14])

names={}
reach2=set(reach); fr=list(reach2)
while fr:
    x=fr.pop()
    for b in list(adj[x])+[b for k,b in edges[x]]:
        if b not in reach2: reach2.add(b); fr.append(b)
print('reach via transforms+crossrefs',len(reach2),'unreached',sorted(S-reach2))
tc=collections.Counter(k for v in edges.values() for k,b in v)
print(tc)
for a in ['A000005','A000041','A000110','A010060','A000035','A008683']:
    print(a, edges[a][:12])
