import math
K=8
def run(c0, rho, gm_base=1.15, gm_cost0=2, gm_step=1.0, per10=2.0, target=40, dt=0.25, rate=1.0, pmult=1.0, tmax=36000, cap=None):
    b=[0]*K; A=[0.0]*K
    x=10.0; L=0; t=0.0; ev=[]; unlocked=1
    while t<tmax:
        while True:
            gcost=10**(gm_cost0+gm_step*L)
            best=None
            for k in range(K-1,-1,-1):
                cost=10**(c0[k]+rho[k]*b[k])
                if cost<=x: best=(cost,k); break
            if gcost<=x and (best is None or gcost<best[0]*3):
                x-=gcost; L+=1; continue
            if best is None: break
            cost,k=best; x-=cost; b[k]+=1; A[k]+=1
            if k+1>unlocked: unlocked=k+1; ev.append((round(t/60,1),'G%d'%(k+1)))
        m=[pmult*rate*(gm_base**L)*(per10**(b[k]//10)) for k in range(K)]
        x+=A[0]*m[0]*dt
        for k in range(1,K): A[k-1]+=A[k]*m[k]*dt
        t+=dt
        if x>=10**target: ev.append((round(t/60,1),'T%d'%target, b, L)); break
    return ev
c0=[1,2,4,7,11,16,22,29]
for rho in [[(k+2)/10 for k in range(1,9)], [0.15+0.05*k for k in range(1,9)]]:
  for gm in [(1.15,2,1.0),(1.2,2,1.0),(1.25,3,1.0)]:
    print(['%.2f'%r for r in rho], gm, run(c0,rho,gm_base=gm[0],gm_cost0=gm[1],gm_step=gm[2]))
print('---')
rho=[0.15+0.05*k for k in range(1,9)]
for rate in [2,3]:
  for tgt in [40,50]:
    for gm in [(1.15,2,1.0),(1.12,2,1.0)]:
      print(rate,tgt,gm, run(c0,rho,gm_base=gm[0],gm_cost0=gm[1],gm_step=gm[2],rate=rate,target=tgt))
