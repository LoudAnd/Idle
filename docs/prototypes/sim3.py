exec(open('sim2.py').read().split("c0=[1,2")[0])
c0=[1,2,4,7,11,16,22,29]
def milestones(rho, rate, gm, targets=(40,100,200,308)):
    out=[]
    for tg in targets:
        ev=run(c0,rho,gm_base=gm[0],gm_cost0=gm[1],gm_step=gm[2],rate=rate,target=tg,dt=0.5,tmax=7200)
        out.append((tg, ev[-1][0] if ev and str(ev[-1][1]).startswith('T') else None))
    return out
for name,rho in [('k+2/10',[(k+2)/10 for k in range(1,9)]),('k/5',[k/5 for k in range(1,9)]),('0.1k+0.2 per^',[0.1*k*k/2+0.25 for k in range(1,9)])]:
  for rate in [2,3]:
    print(name, ['%.2f'%r for r in rho], rate, milestones(rho, rate, (1.15,2,1.0)))
