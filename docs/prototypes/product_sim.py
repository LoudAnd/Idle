"""Prototype of the Sum + Product layers (GDD 5, 7) used for the M5 bands.

Greedy bot as in sim2.py: buys the highest affordable tier, global levels when
cheaper than 3x the tier price. Product reset policy: reset when P gain per
minute of run time falls below reset_frac of its peak in this run (active), or
at any check-in once P gain >= 1 (idle). Upgrades are bought cheapest-first.
Tier autobuyers (2, 8, 21, 55 P) buy max of their tiers every 2 s even while the
bot is idle. Discoveries are modelled as disc_per_min (Coll = c0^n).

Usage: python3 product_sim.py
"""
import math
K = 8
c0 = [1, 2, 4, 7, 11, 16, 22, 29]
rho = [(k + 2) / 10 for k in range(1, 9)]
LOG2_10 = math.log2(10)
UPG = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597]
AUTO = {2: (0, 1), 8: (2, 3), 21: (4, 5), 55: (6, 7)}


def sim(tmax=3600, dt=0.5, pexp=0.25, dP=40, reset_frac=0.9, disc_per_min=0.0,
        act=lambda t: True, idle_reset=False, rep_base=2584):
    P = 0; owned = set(); t = 0.0; resets = []; best = 0; prep = 0; tcap = None

    def pgain(lx):
        l2 = lx * LOG2_10
        if l2 < 128:
            return 0
        v = 2 ** ((l2 - 128) / (dP - (4 if 1597 in owned else 0)))
        v *= (3 if 233 in owned else 1) * (2 ** prep)
        return math.floor(v + 1e-9)

    def buy(x, b, A, L, tiers, glob):
        while True:
            gcost = 10 ** (2 + L) if 2 + L < 308 else float('inf')
            best_ = None
            for k in range(K - 1, -1, -1):
                if k not in tiers:
                    continue
                e = c0[k] + rho[k] * b[k]
                cost = 10 ** e if e < 308 else float('inf')
                if cost <= x:
                    best_ = (cost, k); break
            if glob and gcost <= x and (best_ is None or gcost < best_[0] * 3):
                x -= gcost; L += 1; continue
            if best_ is None:
                break
            cost, k = best_; x -= cost; b[k] += 1; A[k] += 1
        return x, L

    while t < tmax:
        x = 1e4 if 1 in owned else 10.0
        g = 1.175 if 3 in owned else 1.15
        pe = pexp + (0.05 if 89 in owned else 0)
        cc = 1.10 if 144 in owned else 1.08
        auto = set(k for u, ks in AUTO.items() if u in owned for k in ks)
        b = [0] * K; A = [0.0] * K; L = 0; rt = 0.0; maxrate = 0; pg = 0
        while t < tmax:
            on = abs(t - round(t)) < 1e-9
            if act(t) and on:
                x, L = buy(x, b, A, L, set(range(K)), True)
            elif auto and on and int(round(t)) % 2 == 0:
                x, L = buy(x, b, A, L, auto, False)
            coll = cc ** int(disc_per_min * t / 60)
            pb = (1 + P) ** pe
            lx = math.log10(x) if x > 0 else -1
            m = []
            for k in range(K):
                u = (1 + b[k + 1] / 50) if (13 in owned and k < 7) else 1
                if k == 7 and 610 in owned:
                    u *= 1 + max(0, lx)
                m.append(pb * coll * u * 2 * (g ** L) * (2 ** min(b[k] // 10, 34)))
            x += A[0] * m[0] * dt
            for k in range(1, K):
                A[k - 1] += A[k] * m[k] * dt
            x = min(x, 1.79e308)
            t += dt; rt += dt
            lx = math.log10(x) if x > 0 else -1
            if lx >= 308.25:
                tcap = tcap or t; pg = pgain(lx); break
            best = max(best, lx)
            pg = pgain(lx)
            if pg >= 1 and act(t):
                if idle_reset:
                    break
                rate = pg / rt
                if rate > maxrate:
                    maxrate = rate
                elif rate < reset_frac * maxrate:
                    break
        else:
            break
        P += pg; resets.append((round(t / 60, 2), round(rt / 60, 2), pg, round(lx, 1)))
        if tcap:
            break
        while True:
            avail = [u for u in UPG if u not in owned and u <= P]
            if avail:
                u = min(avail); P -= u; owned.add(u); continue
            c = rep_base * 4 ** prep
            if len(owned) == 16 and P >= c:
                P -= c; prep += 1; continue
            break
    return resets, sorted(owned), P, best, tcap


if __name__ == '__main__':
    idle = lambda t: (t % 900) < 10
    for lab, kw in [('active 60 min', dict(tmax=3600)),
                    ('active 60 min, 0.1 disc/min', dict(tmax=3600, disc_per_min=0.1)),
                    ('active to cap', dict(tmax=12 * 3600)),
                    ('active to cap, 0.05 disc/min', dict(tmax=12 * 3600, disc_per_min=0.05)),
                    ('idle 3 h', dict(tmax=3 * 3600, act=idle, idle_reset=True)),
                    ('idle 6 h', dict(tmax=6 * 3600, act=idle, idle_reset=True))]:
        r, o, P, best, tcap = sim(**kw)
        print(f"{lab}: resets={len(r)} owned={o} best_log10x={best:.1f} "
              f"cap_h={tcap and round(tcap / 3600, 2)} first={r[:3]}")
