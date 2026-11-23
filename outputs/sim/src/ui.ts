import type { SpaceBody, RTNCoords } from './types/orbital';
import { fmt, fmtMiss, fmtRelSpeed, escapeHtml } from './ui/formatters';
import type { RiskLevel } from './ui/riskClassifier';
import { filterObjects, type CatalogRowItem } from './ui/filters';

const $ = (id: string): HTMLElement => document.getElementById(id)!;
export { fmt };

export interface UIHandlers {
  select?: (kind: 'sat' | 'deb', index: number) => void;
  step?: (what: string, dir: number) => void;
  rate?: (rate: number) => void;
  pause?: () => void;
  execute?: () => void;
  scrub?: (fraction: number) => void;
  theme?: () => void;
  toggleAutoFollow?: (enabled: boolean) => void;
  toggleAutoDodge?: (enabled: boolean) => void;
  testCrash?: () => void;
  cinema?: () => void;
  returnToEarth?: () => void;
  removeDestroyed?: (kind: 'sat' | 'deb', index: number) => void;
}

export class UI {
  private h: UIHandlers;
  private objList: HTMLElement;
  private search: HTMLInputElement;
  private filter: string = '';
  private items: CatalogRowItem[] = [];
  private sel: { kind: 'sat' | 'deb'; index: number } | null = null;
  private sats: SpaceBody[] = [];
  private debris: SpaceBody[] = [];
  private satN: number = 5;
  private debN: number = 200;
  private threatIndex?: number;
  private _tt?: ReturnType<typeof setTimeout>;

  constructor(h: UIHandlers) {
    this.h = h;
    this.objList = $('objList');
    this.search = $('search') as HTMLInputElement;
    this._bplane();

    this.search.addEventListener('input', () => {
      this.filter = this.search.value;
      this.renderList();
    });

    this.objList.addEventListener('click', e => {
      const trashBtn = (e.target as HTMLElement).closest('.btn-trash') as HTMLElement | null;
      if (trashBtn) {
        e.stopPropagation();
        const kind = trashBtn.dataset.kind as 'sat' | 'deb';
        const index = +(trashBtn.dataset.index || 0);
        this.h.removeDestroyed?.(kind, index);
        return;
      }
      const row = (e.target as HTMLElement).closest('.obj') as HTMLElement | null;
      if (row) {
        this.h.select?.(row.dataset.kind as 'sat' | 'deb', +(row.dataset.index || 0));
      }
    });

    document.querySelectorAll('[data-step]').forEach(b =>
      b.addEventListener('click', () => {
        const el = b as HTMLElement;
        this.h.step?.(el.dataset.step!, +(el.dataset.dir || 0));
      })
    );

    document.querySelectorAll('#rates button').forEach(b =>
      b.addEventListener('click', () => {
        document.querySelectorAll('#rates button').forEach(x => x.classList.toggle('on', x === b));
        const el = b as HTMLElement;
        this.h.rate?.(+(el.dataset.rate || 1));
      })
    );

    $('pauseBtn')?.addEventListener('click', () => this.h.pause?.());
    $('executeBtn')?.addEventListener('click', () => this.h.execute?.());
    $('helpBtn')?.addEventListener('click', () => this.toggleHelp(true));
    $('helpClose')?.addEventListener('click', () => this.toggleHelp(false));
    $('help')?.addEventListener('click', e => {
      if ((e.target as HTMLElement).id === 'help') this.toggleHelp(false);
    });
    $('themeBtn')?.addEventListener('click', () => this.h.theme?.());

    $('timeline')?.addEventListener('click', (e: MouseEvent) => {
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const fill = $('timelineFill');
      if (fill) fill.style.width = (frac * 100).toFixed(2) + '%';
      this.h.scrub?.(frac);
    });

    const autoFollowEl = $('autoFollowToggle') as HTMLInputElement | null;
    autoFollowEl?.addEventListener('change', () => {
      this.h.toggleAutoFollow?.(autoFollowEl.checked);
    });

    const autoDodgeEl = $('autoDodgeToggle') as HTMLInputElement | null;
    autoDodgeEl?.addEventListener('change', () => {
      const enabled = autoDodgeEl.checked;
      this.setAutoDodgeState(enabled);
      this.h.toggleAutoDodge?.(enabled);
    });

    $('testCrashBtn')?.addEventListener('click', () => {
      this.h.testCrash?.();
    });

    $('cinemaBtn')?.addEventListener('click', () => {
      this.toggleCinema();
      this.h.cinema?.();
    });

    $('exitCinemaBtn')?.addEventListener('click', () => {
      this.toggleCinema(false);
      this.h.cinema?.();
    });

    $('returnEarthBtn')?.addEventListener('click', () => {
      this.h.returnToEarth?.();
    });

    addEventListener('keydown', e => {
      const target = e.target as HTMLElement;
      if (e.key === '?' && !target.matches('input,textarea')) this.toggleHelp();
      if ((e.key === 'z' || e.key === 'Z') && !target.matches('input,textarea')) {
        this.toggleCinema();
        this.h.cinema?.();
      }
      if (e.code === 'Space' && !target.matches('input,textarea')) {
        e.preventDefault();
        this.h.pause?.();
      }
    });
  }

  public setAutoDodgeState(enabled: boolean): void {
    const autoDodgeEl = $('autoDodgeToggle') as HTMLInputElement | null;
    const autoDodgeLabel = $('autoDodgeLabel');
    const planState = $('planState');
    const planExplanation = $('planExplanation');
    if (autoDodgeEl) autoDodgeEl.checked = enabled;
    if (autoDodgeLabel) {
      autoDodgeLabel.textContent = enabled ? 'ON' : 'OFF';
      autoDodgeLabel.classList.toggle('off', !enabled);
    }
    if (planState) {
      planState.textContent = enabled ? 'STANDBY' : 'OFFLINE';
      planState.style.borderColor = enabled ? 'var(--line-2)' : '#ef4444';
    }
    if (planExplanation) {
      planExplanation.textContent = enabled
        ? 'Continuous autonomous monitoring active. When debris crosses the 5.0 km keep-out threshold, Engine 2 calculates an optimal avoidance trajectory.'
        : 'Autonomous collision avoidance is OFFLINE. Thruster burns are withheld for kinetic impact simulation.';
    }
  }

  public setCatalog(
    sats: SpaceBody[],
    debris: SpaceBody[],
    riskOfDebris: RiskLevel[]
  ): void {
    this.sats = sats;
    this.debris = debris;
    this.items = [
      ...sats.map((b, i) => ({
        kind: 'sat' as const,
        index: i,
        name: b.name,
        norad: b.norad,
        risk: 'safe' as const,
        lifecycle: b.lifecycle,
      })),
      ...debris.map((b, i) => ({
        kind: 'deb' as const,
        index: i,
        name: b.name,
        norad: b.norad,
        risk: riskOfDebris[i] || 'safe',
        lifecycle: b.lifecycle,
      })),
    ];
    this.renderList();
  }

  public renderList(): void {
    const rows = filterObjects(
      this.items,
      this.filter,
      this.satN,
      this.debN,
      this.threatIndex,
      180
    );

    this.objList.innerHTML =
      rows
        .map(
          o => {
            const isDestroyed = o.lifecycle === 'DISSOLVING' || o.lifecycle === 'DESTROYED';
            const pillText = isDestroyed ? 'DESTROYED' : o.kind === 'sat' ? 'PROTECTED' : o.risk === 'crit' ? 'DANGER' : 'SAFE';
            const pillClass = isDestroyed ? 'danger' : o.kind === 'sat' ? 'protected' : o.risk === 'crit' ? 'danger' : 'safe';
            const trashButton = isDestroyed
              ? `<button class="btn-trash" data-kind="${o.kind}" data-index="${o.index}" aria-label="Remove destroyed ${escapeHtml(o.name)}" title="Remove from list"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`
              : '';
            return `
      <div class="obj${this.sel && this.sel.kind === o.kind && this.sel.index === o.index ? ' sel' : ''}${isDestroyed ? ' destroyed' : ''}"
           role="option" data-kind="${o.kind}" data-index="${o.index}" data-risk="${o.risk}">
        <i class="dot"></i>
        <div class="nm">${escapeHtml(o.name)}</div>
        <span class="pill ${pillClass}">
          ${pillText}
        </span>
        ${trashButton}
      </div>`;
          }
        )
        .join('') || `<p class="fine" style="padding:10px;">No objects match.</p>`;

    const countEl = $('activeObjCount');
    if (countEl) {
      countEl.textContent = String(Math.min(this.satN, this.sats.length) + Math.min(this.debN, this.debris.length));
    }
  }

  public setCounts(satN: number, debN: number): void {
    this.satN = satN;
    this.debN = debN;
    const satEl = $('satCount');
    if (satEl) {
      const activeSats = this.sats.slice(0, satN).filter(s => s.lifecycle !== 'REMOVED').length;
      satEl.textContent = String(activeSats);
    }
    const debEl = $('debrisCount');
    if (debEl) debEl.textContent = String(debN);
    this.renderList();
  }

  public setSelection(o: { kind: 'sat' | 'deb'; index: number } | null): void {
    this.sel = o;
    if (o) {
      const b = o.kind === 'sat' ? this.sats[o.index] : this.debris[o.index];
      const selNameEl = $('selName');
      if (selNameEl) selNameEl.textContent = b ? b.name : '—';
    }
    this.renderList();
  }

  public setLivePill(text: string, state: 'nominal' | 'alert' | 'safe'): void {
    const pill = $('livePill');
    const pillText = $('livePillText');
    if (!pill || !pillText) return;

    pillText.textContent = text;
    pill.classList.remove('alert', 'safe-achieved');
    if (state === 'alert') {
      pill.classList.add('alert');
    } else if (state === 'safe') {
      pill.classList.add('safe-achieved');
    }
  }

  public setClock({
    met,
    tcaMin = 15,
    windowMin = 15,
  }: {
    utc?: string;
    met: string;
    tcaMin?: number;
    burnMin?: number;
    windowMin?: number;
  }): void {
    const metEl = $('met');
    if (metEl) metEl.textContent = met;

    const fill = $('timelineFill');
    if (fill) {
      const frac = windowMin > 0 ? Math.min(1, Math.max(0, (windowMin - tcaMin) / windowMin)) : 0;
      fill.style.width = (frac * 100).toFixed(2) + '%';
    }
  }

  public setThreat(t: {
    debIndex?: number;
    risk: RiskLevel;
    sat: string;
    deb: string;
    miss: number;
    relSpeed: number;
    pcText?: string;
    tcaMin?: number;
    rt?: RTNCoords;
    postMiss?: number | null;
    fuel?: number;
  }): void {
    if (t.debIndex != null) {
      const changed = this.threatIndex !== t.debIndex;
      this.threatIndex = t.debIndex;
      const it = this.items.find(o => o.kind === 'deb' && o.index === t.debIndex);
      if (it) it.risk = t.risk;
      if (changed) this.renderList();
    }

    const badge = $('statusBadge') || $('riskChip');
    const pairEl = $('pairLabel');
    const missEl = $('kpiMiss') || $('threatMiss');
    const speedEl = $('kpiSpeed') || $('threatVel');
    const fuelEl = $('kpiFuel') || $('dodgeBurn');
    const threatSatEl = $('threatSat');
    const threatDebEl = $('threatDeb');

    const isDanger = t.risk === 'crit' || t.miss < 5.0;

    if (badge) {
      badge.textContent = isDanger ? '▲ RISK' : '● SAFE';
      badge.className = isDanger ? 'status-badge danger' : 'status-badge safe';
    }

    if (pairEl) {
      pairEl.textContent = isDanger ? `${t.sat} · ${t.deb}` : `${t.sat} · Scanning LEO`;
      pairEl.title = `Active conjunction pair: ${t.sat} & ${t.deb}`;
    }

    if (threatSatEl) threatSatEl.textContent = t.sat;
    if (threatDebEl) threatDebEl.textContent = t.deb;

    if (missEl) {
      if (isDanger) {
        const post = t.postMiss != null ? fmtMiss(t.postMiss) : '7.2 km';
        missEl.textContent = `${fmtMiss(t.miss)}→${post}`;
      } else {
        missEl.textContent = '> 25 km';
      }
    }

    if (speedEl) speedEl.textContent = fmtRelSpeed(t.relSpeed);

    if (fuelEl) {
      const f = t.fuel != null ? t.fuel : 0;
      fuelEl.textContent = `${f.toFixed(2)} m/s`;
    }
  }

  private _bplane(): void {
    // 2D Target Radar canvas removed in Phase 3 in favor of Swiss-minimal KPI grid
  }

  /**
   * 2D Target Radar replaced by Swiss-Minimal KPI grid in Phase 3.
   */
  public drawRadar(_rt?: RTNCoords, _missKm?: number | null, _postMissKm?: number | null): void {
    // Intentionally no-op; clean 3-cell KPI grid provides instant miss & speed clearance metrics.
  }

  public setPlan(plan: any, _fuelLeft?: number, _state?: string): void {
    const btn = $('executeBtn') as HTMLButtonElement;
    if (btn) btn.disabled = !plan;

    const planStateEl = $('planState');
    const fuelEl = $('kpiFuel') || $('dodgeBurn');

    if (!plan) {
      if (planStateEl) planStateEl.textContent = 'STANDBY';
      return;
    }

    if (planStateEl) planStateEl.textContent = plan.safe ? 'FEASIBLE' : 'EVALUATING';

    const dvMps = plan.dvMs != null ? plan.dvMs : Math.min(4.5, Math.max(0.4, plan.dv || 1.85));
    if (fuelEl) fuelEl.textContent = `${dvMps.toFixed(2)} m/s`;
  }

  public setRate(r: number): void {
    document.querySelectorAll('#rates button').forEach(b => {
      const el = b as HTMLElement;
      b.classList.toggle('on', +el.dataset.rate! === r);
    });
  }

  public setPaused(p: boolean): void {
    const btn = $('pauseBtn');
    if (btn) btn.textContent = p ? 'RESUME' : 'PAUSE';
  }

  public setSource(ageDays: number, live: boolean): void {
    const tag = $('sourceTag');
    if (tag) tag.textContent = live ? 'CelesTrak · LIVE' : `CelesTrak · +${fmt(ageDays, 0)}d`;
  }

  public toast(msg: string): void {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('on'), 2600);
  }

  public setLoading(v: boolean): void {
    $('loading')?.classList.toggle('hide', !v);
  }

  public toggleHelp(force?: boolean): void {
    const el = $('help');
    if (!el) return;
    const show = force === undefined ? el.hidden : force;
    el.hidden = !show;
  }

  public setTheme(light: boolean): void {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    const btn = $('themeBtn');
    if (btn) btn.textContent = light ? 'DARK' : 'LIGHT';
  }

  public toggleCinema(force?: boolean): boolean {
    const isCinema = document.body.getAttribute('data-cinema') === 'true';
    const next = force !== undefined ? force : !isCinema;
    if (next) {
      document.body.setAttribute('data-cinema', 'true');
    } else {
      document.body.removeAttribute('data-cinema');
    }
    const btn = $('cinemaBtn');
    if (btn) btn.textContent = next ? 'EXIT ZEN' : 'CINEMA';
    return next;
  }

  public setCameraTelemetry(telemetry: {
    frameMode: 'PLANET_CENTRIC' | 'OBJECT_CENTRIC';
    targetName: string;
    distance: number;
    isTransitioning: boolean;
  }): void {
    const tag = $('camModeTag');
    const target = $('camModeTarget');
    const returnBtn = $('returnEarthBtn');

    if (telemetry.frameMode === 'OBJECT_CENTRIC') {
      if (tag) tag.textContent = 'INSPECT VIEW';
      if (target) {
        const dStr = telemetry.distance < 1.0
          ? `${(telemetry.distance * 100).toFixed(1)} km`
          : `${(telemetry.distance * 100).toFixed(0)} km`;
        target.textContent = `${telemetry.targetName} (${dStr})`;
      }
      if (returnBtn) returnBtn.style.display = 'inline-block';
    } else {
      if (tag) tag.textContent = 'PLANET VIEW';
      if (target) target.textContent = 'Earth Center';
      if (returnBtn) returnBtn.style.display = 'none';
    }
  }

  public setEarthLighting(mode: 'full-lit' | 'day-night'): void {
    const icon = $('earthLightIcon');
    const text = $('earthLightText');
    if (mode === 'full-lit') {
      if (icon) icon.textContent = '☀️';
      if (text) text.textContent = 'FULL LIT';
    } else {
      if (icon) icon.textContent = '🌗';
      if (text) text.textContent = 'DAY / NIGHT';
    }
  }
}
