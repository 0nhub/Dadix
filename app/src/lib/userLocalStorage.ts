export type TableStyleTheme = 'classic' | 'lineless' | 'panel';

/** Where to land when starting Dadix: dashboard list, last used table, or a specific project (first table). */
export type StartTarget = 'dashboard' | 'lastUsedTable' | 'project';

export class UserLocalStorage {
  static #projectIdKey = 'dadix-last-project-id';
  static #tableIdKey = 'dadix-last-table-id';
  static #viewIdKey = 'dadix-last-view-id';
  static #recordEditorWidthKey = 'dadix-record-editor-width';
  static #tableStyleThemeKey = 'dadix-table-style-theme';
  static #dashboardViewModeKey = 'dadix-dashboard-view-mode';
  static #startTargetKey = 'dadix-start-target';
  static #startProjectIdKey = 'dadix-start-project-id';
  static #skipDeleteConfirmationKey = 'dadix-skip-delete-confirmation';
  static #dateFormatKey = 'dadix-date-format';
  static #timeFormatKey = 'dadix-time-format';

  static getProjectId() {
    return localStorage?.getItem(this.#projectIdKey) || undefined;
  }
  static getTableId() {
    return localStorage?.getItem(this.#tableIdKey) || undefined;
  }
  static getViewId() {
    return localStorage?.getItem(this.#viewIdKey) || undefined;
  }
  static getRecordEditorWidth() {
    return localStorage?.getItem(this.#recordEditorWidthKey) || undefined;
  }

  static setProjectId(newValue: string) {
    if (newValue === this.getProjectId()) return true;
    this.setTableId('');
    this.setViewId('');
    return localStorage?.setItem(this.#projectIdKey, newValue);
  }
  static setTableId(newValue: string) {
    if (newValue === this.getTableId()) return true;
    this.setViewId('');
    return localStorage?.setItem(this.#tableIdKey, newValue);
  }
  static setViewId(newValue: string) {
    return localStorage?.setItem(this.#viewIdKey, newValue);
  }
  static setRecordEditorWidth(newValue: number | undefined) {
    return localStorage?.setItem(
      this.#recordEditorWidthKey,
      newValue?.toString() || ''
    );
  }

  static getTableStyleTheme(): TableStyleTheme {
    const v = localStorage?.getItem(this.#tableStyleThemeKey);
    if (v === 'lineless' || v === 'panel' || v === 'classic') return v;
    return 'classic';
  }

  static setTableStyleTheme(theme: TableStyleTheme) {
    return localStorage?.setItem(this.#tableStyleThemeKey, theme);
  }

  static getDashboardViewMode(): 'grid' | 'list' {
    const v = localStorage?.getItem(this.#dashboardViewModeKey);
    return v === 'list' ? 'list' : 'grid';
  }

  static setDashboardViewMode(mode: 'grid' | 'list') {
    return localStorage?.setItem(this.#dashboardViewModeKey, mode);
  }

  static getStartTarget(): StartTarget {
    const v = localStorage?.getItem(this.#startTargetKey);
    if (v === 'dashboard' || v === 'project') return v;
    return 'lastUsedTable';
  }

  static setStartTarget(target: StartTarget) {
    return localStorage?.setItem(this.#startTargetKey, target);
  }

  /** Session flag: start-target redirect only once after login/open, not on every /dashboard visit. */
  static #startLandingSessionKey = 'dadix-start-landing-applied';

  static shouldApplyStartLanding(): boolean {
    if (typeof sessionStorage === 'undefined') return false;
    try {
      return sessionStorage.getItem(this.#startLandingSessionKey) !== '1';
    } catch {
      return false;
    }
  }

  static markStartLandingApplied() {
    try {
      sessionStorage?.setItem(this.#startLandingSessionKey, '1');
    } catch {
      /* ignore */
    }
  }

  /** Call before intentional navigation to /dashboard so start-target does not bounce away. */
  static preferDashboardHome() {
    this.markStartLandingApplied();
  }

  static getStartProjectId(): string | undefined {
    return localStorage?.getItem(this.#startProjectIdKey) || undefined;
  }

  static setStartProjectId(projectId: string) {
    return localStorage?.setItem(this.#startProjectIdKey, projectId);
  }

  static getSkipDeleteConfirmation(): boolean {
    return localStorage?.getItem(this.#skipDeleteConfirmationKey) === 'true';
  }

  static setSkipDeleteConfirmation(skip: boolean) {
    return localStorage?.setItem(this.#skipDeleteConfirmationKey, skip ? 'true' : 'false');
  }

  /** Default date format for display (e.g. DD.MM.YYYY). */
  static getDateFormat(): string {
    return localStorage?.getItem(this.#dateFormatKey) || 'DD.MM.YYYY';
  }

  static setDateFormat(format: string) {
    return localStorage?.setItem(this.#dateFormatKey, format);
  }

  /** Time format: '24h' or '12h'. */
  static getTimeFormat(): '24h' | '12h' {
    const v = localStorage?.getItem(this.#timeFormatKey);
    return v === '12h' ? '12h' : '24h';
  }

  static setTimeFormat(format: '24h' | '12h') {
    return localStorage?.setItem(this.#timeFormatKey, format);
  }

  static clearAll() {
    this.setProjectId('');
    this.setTableId('');
    this.setViewId('');
    this.setRecordEditorWidth(undefined);
    localStorage?.removeItem(this.#tableStyleThemeKey);
    localStorage?.removeItem(this.#dashboardViewModeKey);
    localStorage?.removeItem(this.#startTargetKey);
    localStorage?.removeItem(this.#startProjectIdKey);
    localStorage?.removeItem(this.#skipDeleteConfirmationKey);
    localStorage?.removeItem(this.#dateFormatKey);
    localStorage?.removeItem(this.#timeFormatKey);
  }
}
