# Sum-layer prototype for the idle profile (GDD 15, 22.6) and the second-run speed-up (ROADMAP M5).
# Run: python3 idle_sim.py
import math
K=8
c0=[1,2,4,7,11,16,22,29]; rho=[(k+2)/10 for k in range(1,9)]
def run(can_act, dt=0.5, tmax=6*3600, target=math.log10(2**128)):
    b=[0]*K; A=[0.0]*K; x=10.0; L=0; t=0.0; ev=[]; unlocked=0
    while t<tmax:
        if can_act(t):
            while True:
                gcost=10**(2+L); best=None
                for k in range(K-1,-1,-1):
                    cost=10**(c0[k]+rho[k]*b[k])
                    if cost<=x: best=(cost,k); break
                if gcost<=x and (best is None or gcost<best[0]*3): x-=gcost; L+=1; continue
                if best is None: break
                cost,k=best; x-=cost; b[k]+=1; A[k]+=1
                if k+1>unlocked: unlocked=k+1; ev.append((round(t/60,1),'G%d'%(k+1)))
        m=[2*(1.15**L)*(2**min(b[k]//10,34)) for k in range(K)]
        x+=A[0]*m[0]*dt
        for k in range(1,K): A[k-1]+=A[k]*m[k]*dt
        t+=dt
        if x>0 and math.log10(x)>=target: ev.append((round(t/60,1),'2^128')); return ev
    ev.append(('end', 'log10x=%.1f'%math.log10(max(x,1)), b, L)); return ev
print('active every 1s:', run(lambda t: abs(t-round(t))<1e-9))
print('idle 10s/15min:', run(lambda t: (t%900)<10 and abs(t-round(t))<1e-9, tmax=3*3600))

def run2(x0,pm, dt=0.5, tmax=3*3600, target=math.log10(2**128)):
    b=[0]*K; A=[0.0]*K; x=x0; L=0; t=0.0
    while t<tmax:
        if abs(t-round(t))<1e-9:
            while True:
                gcost=10**(2+L); best=None
                for k in range(K-1,-1,-1):
                    cost=10**(c0[k]+rho[k]*b[k])
                    if cost<=x: best=(cost,k); break
                if gcost<=x and (best is None or gcost<best[0]*3): x-=gcost; L+=1; continue
                if best is None: break
                cost,k=best; x-=cost; b[k]+=1; A[k]+=1
        m=[pm*2*(1.15**L)*(2**min(b[k]//10,34)) for k in range(K)]
        x+=A[0]*m[0]*dt
        for k in range(1,K): A[k-1]+=A[k]*m[k]*dt
        t+=dt
        if x>0 and math.log10(x)>=target: return round(t/60,2)
for x0,pm,lab in [(1e4,1,'start 1e4, P spent'),(10,2**0.25,'keep 1 P'),(1e4,3**0.25,'P=3 resets later; 1e4 + keep 2 P'),(1e4,(1+5)**0.25,'1e4 + 5 unspent')]:
    print(lab, run2(x0,pm))
for per in [300, 600, 900]:
    print('check-in every', per, 's:', run(lambda t, per=per: (t%per)<10 and abs(t-round(t))<1e-9, tmax=4*3600)[-1])
