import type { WeatherKind } from '../audio/AudioEngine';
import { TASKS } from '../tasks/tasks';
import type { TaskAction, TaskState } from '../tasks/tasks';

export interface TaskBookCallbacks {
  onAction: (action: TaskAction) => void;
  onToggleManual: (key: string) => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * 声音探索任务册覆盖层：像一本可以盖章的小手册。
 * 内容由 Game 每次用最新的 TaskState 渲染；本类只负责展示与转发操作。
 */
export class TaskBook {
  private root: HTMLElement;
  private list: HTMLElement;
  private progressEl: HTMLElement;
  private allDoneEl: HTMLElement;
  private resetBtn: HTMLButtonElement;
  private expanded: string | null = TASKS[0].id;
  private resetArmed = false;
  private resetTimer: number | null = null;

  constructor(private cb: TaskBookCallbacks) {
    const el = <T extends HTMLElement>(id: string): T => {
      const node = document.getElementById(id);
      if (!node) throw new Error(`#${id} missing`);
      return node as T;
    };
    this.root = el('taskBook');
    this.list = el('taskBookList');
    this.progressEl = el('taskBookProgress');
    this.allDoneEl = el('taskBookAllDone');

    el<HTMLButtonElement>('taskBookClose').addEventListener('click', () => this.cb.onClose());
    this.resetBtn = el<HTMLButtonElement>('taskBookReset');
    this.resetBtn.addEventListener('click', () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        this.resetBtn.textContent = '再点一次确认清空';
        this.resetBtn.classList.add('confirm');
        this.resetTimer = window.setTimeout(() => this.disarmReset(), 3000);
        return;
      }
      this.disarmReset();
      this.cb.onReset();
    });
    this.root.addEventListener('click', (e) => {
      // 点手册外的暗背景收起（家长腾出手调河里的东西）
      if (e.target === this.root) this.cb.onClose();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || this.root.classList.contains('hidden')) return;
      // 命名框（z-index 更高）打开时，Esc 只归命名框处理，避免一次按键连关两层
      const songDialog = document.getElementById('songDialog');
      if (songDialog && !songDialog.classList.contains('hidden')) return;
      this.cb.onClose();
    });
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(states: TaskState[]): void {
    this.root.classList.remove('hidden');
    // 打开时若当前展开的任务已全部完成，自动展开下一个未完成的任务
    const current = states.find((t) => t.id === this.expanded);
    if (!current || current.done) {
      this.expanded = states.find((t) => !t.done)?.id ?? TASKS[0].id;
    }
    this.render(states);
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  render(states: TaskState[]): void {
    const doneCount = states.filter((t) => t.done).length;
    const totalSteps = TASKS.reduce((n, t) => n + t.steps.length, 0);
    const doneSteps = states.reduce(
      (n, t) => n + t.steps.filter((s) => s.done).length,
      0
    );
    this.progressEl.textContent = `已完成 ${doneCount}/${TASKS.length} 个任务 · ${doneSteps}/${totalSteps} 个小印章`;
    this.allDoneEl.hidden = doneCount !== TASKS.length;

    this.list.replaceChildren(...TASKS.map((def) => this.renderTask(def, states)));
  }

  private renderTask(
    def: (typeof TASKS)[number],
    states: TaskState[]
  ): HTMLElement {
    const state = states.find((t) => t.id === def.id);
    const done = !!state?.done;
    const open = this.expanded === def.id;

    const card = document.createElement('section');
    card.className = 'tb-card' + (done ? ' done' : '') + (open ? ' open' : '');

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'tb-head';
    head.setAttribute('aria-expanded', String(open));
    const headTop = document.createElement('span');
    headTop.className = 'tb-head-main';
    const icon = document.createElement('span');
    icon.className = 'tb-icon';
    icon.textContent = done ? '⭐' : def.icon;
    icon.setAttribute('aria-hidden', 'true');
    const titles = document.createElement('span');
    titles.className = 'tb-titles';
    const title = document.createElement('span');
    title.className = 'tb-title';
    title.textContent = def.title;
    const goal = document.createElement('span');
    goal.className = 'tb-goal';
    goal.textContent = def.goal;
    titles.append(title, goal);
    const stepDots = document.createElement('span');
    stepDots.className = 'tb-dots';
    stepDots.setAttribute('aria-label', `完成 ${state?.steps.filter((s) => s.done).length ?? 0}/${def.steps.length} 步`);
    def.steps.forEach((step) => {
      const dot = document.createElement('span');
      dot.className = 'tb-dot' + (state?.steps.find((s) => s.id === step.id)?.done ? ' on' : '');
      stepDots.append(dot);
    });
    headTop.append(icon, titles, stepDots);
    head.append(headTop);
    head.addEventListener('click', () => {
      this.expanded = open ? null : def.id;
      this.list.replaceChildren(...TASKS.map((d) => this.renderTask(d, states)));
    });

    card.append(head);

    if (open) {
      const body = document.createElement('div');
      body.className = 'tb-body';
      def.steps.forEach((step, i) => {
        const stepDone = !!state?.steps[i]?.done;
        const row = document.createElement('div');
        row.className = 'tb-step' + (stepDone ? ' done' : '');

        const stamp = document.createElement('button');
        stamp.type = 'button';
        stamp.className = 'tb-stamp';
        stamp.setAttribute('aria-pressed', String(stepDone));
        stamp.setAttribute(
          'aria-label',
          stepDone ? `取消第 ${i + 1} 步的印章` : `给第 ${i + 1} 步盖章`
        );
        stamp.textContent = stepDone ? '✓' : String(i + 1);
        stamp.disabled = step.kind === 'auto';
        stamp.title = step.kind === 'auto' ? '这一步会自动完成' : '聊完后点这里盖章';
        if (step.kind === 'manual') {
          stamp.addEventListener('click', () => this.cb.onToggleManual(`${def.id}:${step.id}`));
        }

        const texts = document.createElement('div');
        texts.className = 'tb-step-text';
        const main = document.createElement('p');
        main.className = 'tb-step-main';
        const tag = document.createElement('span');
        tag.className = 'tb-tag ' + step.kind;
        tag.textContent = step.kind === 'auto' ? '自动' : '盖章';
        main.append(tag, document.createTextNode(step.text));
        texts.append(main);
        if (step.hint) {
          const hint = document.createElement('p');
          hint.className = 'tb-hint';
          hint.textContent = `💬 家长提示：${step.hint}`;
          texts.append(hint);
        }
        if (step.action && !stepDone) {
          const actBtn = document.createElement('button');
          actBtn.type = 'button';
          actBtn.className = 'tb-action';
          actBtn.textContent = step.action.label;
          actBtn.addEventListener('click', () => {
            this.cb.onAction(step.action!);
            // 天气/水位等切换立即生效，但判定事实要等下一次刷新
          });
          texts.append(actBtn);
        }
        row.append(stamp, texts);
        body.append(row);
      });
      card.append(body);
    }

    return card;
  }

  private disarmReset(): void {
    this.resetArmed = false;
    this.resetBtn.classList.remove('confirm');
    this.resetBtn.textContent = '🧽 清空任务册（重新开始）';
    if (this.resetTimer !== null) {
      window.clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}

/** 把任务册动作翻译成人话的操作提示（供 Game 弹 toast） */
export function describeAction(action: TaskAction): string {
  switch (action.kind) {
    case 'weather': {
      const name: Record<WeatherKind, string> = { sunny: '晴天 ☀️', rain: '雨天 🌧️', wind: '风天 💨' };
      return `已切到${name[action.weather ?? 'sunny']}，和孩子一起听 10 秒吧`;
    }
    case 'setLevel':
      return '水位调高啦，去河里找发光的 ♪ 吧 💧';
    case 'setFlow':
      return '水流变快啦，听听歌是不是也跑起来了 🌊';
    case 'mic':
      return '准备录音：点一下「🎙️ 录一段声音」开始（再点停止）';
    case 'save':
      return '打开了家长面板：给歌起个名字，点「💾 保存这首歌」';
  }
}
