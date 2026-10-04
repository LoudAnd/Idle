import re,math,itertools
from math import comb
import os
# Needs a working tree with the seq files checked out at the pinned commit.
O=os.environ.get('ASSET_SRC_OEIS','/home/user/oeis/oeisdata')
cands=open('cands.txt').read().split()
def load(a):
    t=open(f"{O}/seq/{a[:4]}/{a}.seq",encoding='utf-8').read().splitlines()
    terms=''.join(l[11:] for l in t if l[:2] in('%S','%T','%U'))
    terms=[int(x) for x in terms.split(',') if x]
    off=int([l[11:] for l in t if l.startswith('%O')][0].split(',')[0])
    return off,terms
D={a:load(a) for a in cands}
def psum(s): return list(itertools.accumulate(s))
def pprod(s): return list(itertools.accumulate(s,lambda x,y:x*y))
def diff(s): return [b-a for a,b in zip(s,s[1:])]
def binom(s): return [sum(comb(n,k)*s[k] for k in range(n+1)) for n in range(len(s))]
def ibinom(s): return [sum((-1)**(n-k)*comb(n,k)*s[k] for k in range(n+1)) for n in range(len(s))]
def euler(s):  # s indexed from 1: s[0]=a(1)
    N=len(s); b=[0]*(N+1)
    c=[0]*(N+1)
    for n in range(1,N+1): c[n]=sum(d*s[d-1] for d in range(1,n+1) if n%d==0)
    b[0]=1
    for n in range(1,N+1): b[n]=(c[n]+sum(c[k]*b[n-k] for k in range(1,n)))//n
    return b
def mobius(n):
    r=1;p=2;m=n
    while p*p<=m:
        if m%p==0:
            m//=p
            if m%p==0: return 0
            r=-r
        p+=1
    if m>1: r=-r
    return r
def invmob(s): return [sum(s[d-1] for d in range(1,n+1) if n%d==0) for n in range(1,len(s)+1)]
def mob(s): return [sum(mobius(n//d)*s[d-1] for d in range(1,n+1) if n%d==0) for n in range(1,len(s)+1)]
def positions(s,off,v): return [i+off for i,x in enumerate(s) if x==v]
def complement(s): 
    S=set(s); m=max(s[:len(s)//2]); return [k for k in range(1,m) if k not in S]
def counting(s):
    S=set(s); return [sum(1 for x in s if x<=n) for n in range(1,min(max(s[:20]),200))]
def recpos(s,off):
    out=[];best=None
    for i,x in enumerate(s):
        if best is None or x>best: best=x; out.append(i+off)
    return out
def expt(s): # exponential transform, s from index1
    N=len(s); b=[1]+[0]*N
    for n in range(1,N+1):
        b[n]=sum(comb(n-1,k-1)*s[k-1]*b[n-k] for k in range(1,n+1))
    return b
def match(r):
    r=[x for x in r]
    hits=[]
    for a,(off,t) in D.items():
        for sr in range(0,3):
          for st in range(0,4):
            w=r[sr:sr+12]; tw=t[st:st+12]
            if len(w)==12 and w==tw: hits.append(a); break
          else: continue
          break
    return sorted(set(hits))
def g(a): return D[a][1]
tests={
 'S A000027':psum(g('A000027')),'S A005408':psum(g('A005408')),'S A000217':psum(g('A000217')),
 'S A000290':psum(g('A000290')),'S A000108':psum(g('A000108')),'S A000079':psum(g('A000079')),
 'P A000027':pprod(g('A000027')),'P A000040':pprod(g('A000040')),'P A005408':pprod(g('A005408')),
 'B A000012':binom(g('A000012')),'B A000079':binom(g('A000079')),'B A001006':binom(g('A001006')),'Binv A001006':ibinom(g('A001006')),
 'E A000012':euler(g('A000012')),'D A000040':diff(g('A000040')),'D A000079':diff(g('A000079')),
 'IM A000012':invmob(g('A000012')),'IM A000027':invmob(g('A000027')),'M A000027':mob(g('A000027')),
 'pos2 A000005':positions(g('A000005'),1,2),'pos1 A010060':positions(g('A010060'),0,1),'pos0 A010060':positions(g('A010060'),0,0),
 'comp A000201':complement(g('A000201')),'comp A000040':complement(g('A000040')),'cnt A000040':counting(g('A000040')),
 'rec A006577':recpos(g('A006577'),1),'EXP A000012':expt(g('A000012')),'pos1 A000035':positions(g('A000035'),0,1),
 'D A000217':diff(g('A000217')),'B A000108':binom(g('A000108')),'Binv A000110':ibinom(g('A000110')),
 'D A000290':diff(g('A000290')),'S A000045':psum(g('A000045')),'S A005843':psum(g('A005843')),'P A000079':pprod(g('A000079')),
 'E A000081':euler(g('A000081')), 'nz A008683':[i+1 for i,x in enumerate(g('A008683')) if x!=0],
 'S A001045':psum(g('A001045')), 'B A000085':binom(g('A000085')),'E A000027':euler(g('A000027')),
}
for k,v in tests.items(): print(k,'->',match(v), v[:8])
