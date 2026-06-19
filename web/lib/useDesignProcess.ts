"use client";

import { useReducer, useCallback, useMemo } from "react";

const uuidv7 = () => crypto.randomUUID();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  createdAt: number;
}

export interface Phase {
  id: string;
  title: string;
  tasks: Task[];
  /** Phases flagged isPreCoding must all be complete before isReadyToCode is true. */
  isPreCoding: boolean;
  order: number;
}

export interface ComplexityOption {
  id: string;
  approach: string;
  time: string;
  space: string;
  notes?: string;
}

export interface DesignProcessState {
  problem: string;
  phases: Phase[];
  pseudocode: string;
  complexityOptions: ComplexityOption[];
  chosenApproachId: string | null;
  startedAt: number;
  updatedAt: number;
}

export interface PhaseStatus {
  phaseId: string;
  title: string;
  totalTasks: number;
  completedTasks: number;
  isComplete: boolean;
  progressPercent: number;
}

export interface Metrics {
  progressPercent: number;
  phaseStatuses: PhaseStatus[];
  currentPhase: Phase | null;
  isReadyToCode: boolean;
}

// ─── Default phases ───────────────────────────────────────────────────────────

function buildDefaultPhases(): Phase[] {
  const now = Date.now();

  const task = (title: string, description?: string): Task => ({
    id: uuidv7(), title, description, completed: false, createdAt: now,
  });

  return [
    {
      id: uuidv7(), title: "Understand the Problem", isPreCoding: true, order: 0,
      tasks: [
        task("Read the problem statement"),
        task("Identify inputs and outputs", "What types? What size?"),
        task("Clarify constraints", "Range of values, sorted?, duplicates?"),
        task("Enumerate edge cases", "Empty input, single element, all same value"),
      ],
    },
    {
      id: uuidv7(), title: "Analyze Approaches", isPreCoding: true, order: 1,
      tasks: [
        task("Brainstorm at least two approaches"),
        task("Estimate time complexity per approach"),
        task("Estimate space complexity per approach"),
        task("Choose the optimal approach"),
      ],
    },
    {
      id: uuidv7(), title: "Design & Pseudocode", isPreCoding: true, order: 2,
      tasks: [
        task("Write pseudocode for chosen approach"),
        task("Dry-run with a small example"),
        task("Confirm edge cases are handled"),
      ],
    },
    {
      id: uuidv7(), title: "Code", isPreCoding: false, order: 3,
      tasks: [
        task("Implement the solution"),
        task("Handle edge cases in code"),
      ],
    },
    {
      id: uuidv7(), title: "Test & Optimize", isPreCoding: false, order: 4,
      tasks: [
        task("Run provided examples"),
        task("Run edge-case examples"),
        task("Review for off-by-one errors and overflow"),
        task("Consider further optimizations"),
      ],
    },
  ];
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: "TOGGLE_TASK"; phaseId: string; taskId: string }
  | { type: "ADD_TASK"; phaseId: string; title: string; description?: string }
  | { type: "REMOVE_TASK"; phaseId: string; taskId: string }
  | { type: "UPDATE_TASK"; phaseId: string; taskId: string; patch: Partial<Pick<Task, "title" | "description" | "completed">> }
  | { type: "ADD_PHASE"; title: string; isPreCoding?: boolean; tasks?: Array<Pick<Task, "title" | "description">> }
  | { type: "REMOVE_PHASE"; phaseId: string }
  | { type: "ADD_COMPLEXITY"; option: Omit<ComplexityOption, "id"> }
  | { type: "REMOVE_COMPLEXITY"; optionId: string }
  | { type: "SET_PSEUDOCODE"; content: string }
  | { type: "SET_CHOSEN_APPROACH"; optionId: string | null }
  | { type: "RESET" };

function reducer(state: DesignProcessState, action: Action): DesignProcessState {
  const now = Date.now();

  switch (action.type) {
    case "TOGGLE_TASK":
      return {
        ...state,
        updatedAt: now,
        phases: state.phases.map((p) =>
          p.id !== action.phaseId ? p : {
            ...p,
            tasks: p.tasks.map((t) =>
              t.id !== action.taskId ? t : { ...t, completed: !t.completed },
            ),
          },
        ),
      };

    case "ADD_TASK":
      return {
        ...state,
        updatedAt: now,
        phases: state.phases.map((p) =>
          p.id !== action.phaseId ? p : {
            ...p,
            tasks: [...p.tasks, { id: uuidv7(), title: action.title, description: action.description, completed: false, createdAt: now }],
          },
        ),
      };

    case "REMOVE_TASK":
      return {
        ...state,
        updatedAt: now,
        phases: state.phases.map((p) =>
          p.id !== action.phaseId ? p : { ...p, tasks: p.tasks.filter((t) => t.id !== action.taskId) },
        ),
      };

    case "UPDATE_TASK":
      return {
        ...state,
        updatedAt: now,
        phases: state.phases.map((p) =>
          p.id !== action.phaseId ? p : {
            ...p,
            tasks: p.tasks.map((t) =>
              t.id !== action.taskId ? t : { ...t, ...action.patch },
            ),
          },
        ),
      };

    case "ADD_PHASE": {
      const maxOrder = state.phases.reduce((m, p) => Math.max(m, p.order), -1);
      return {
        ...state,
        updatedAt: now,
        phases: [
          ...state.phases,
          {
            id: uuidv7(),
            title: action.title,
            isPreCoding: action.isPreCoding ?? false,
            order: maxOrder + 1,
            tasks: (action.tasks ?? []).map((t) => ({ id: uuidv7(), title: t.title, description: t.description, completed: false, createdAt: now })),
          },
        ],
      };
    }

    case "REMOVE_PHASE":
      return {
        ...state,
        updatedAt: now,
        phases: state.phases.filter((p) => p.id !== action.phaseId),
      };

    case "ADD_COMPLEXITY":
      return {
        ...state,
        updatedAt: now,
        complexityOptions: [...state.complexityOptions, { id: uuidv7(), ...action.option }],
      };

    case "REMOVE_COMPLEXITY":
      return {
        ...state,
        updatedAt: now,
        complexityOptions: state.complexityOptions.filter((o) => o.id !== action.optionId),
        chosenApproachId: state.chosenApproachId === action.optionId ? null : state.chosenApproachId,
      };

    case "SET_PSEUDOCODE":
      return { ...state, updatedAt: now, pseudocode: action.content };

    case "SET_CHOSEN_APPROACH":
      return { ...state, updatedAt: now, chosenApproachId: action.optionId };

    case "RESET":
      return buildInitialState(state.problem);

    default:
      return state;
  }
}

// ─── Initial state ────────────────────────────────────────────────────────────

function buildInitialState(problem: string): DesignProcessState {
  return {
    problem,
    phases: buildDefaultPhases(),
    pseudocode: "",
    complexityOptions: [],
    chosenApproachId: null,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Export summary ───────────────────────────────────────────────────────────

function buildMarkdownSummary(state: DesignProcessState, metrics: Metrics): string {
  const date = new Date(state.startedAt).toLocaleString();
  const lines: string[] = [
    `# Design Process: ${state.problem}`,
    ``,
    `**Started:** ${date}  `,
    `**Progress:** ${metrics.progressPercent}%`,
    ``,
    `## Phases`,
    ``,
  ];

  for (const phase of [...state.phases].sort((a, b) => a.order - b.order)) {
    const status = metrics.phaseStatuses.find((s) => s.phaseId === phase.id);
    const badge = status?.isComplete ? "✅" : "🔲";
    const count = `${status?.completedTasks ?? 0}/${status?.totalTasks ?? 0}`;
    lines.push(`### ${badge} ${phase.title} (${count})`);
    for (const task of phase.tasks) {
      const tick = task.completed ? "x" : " ";
      const desc = task.description ? ` — *${task.description}*` : "";
      lines.push(`- [${tick}] ${task.title}${desc}`);
    }
    lines.push(``);
  }

  if (state.complexityOptions.length > 0) {
    lines.push(`## Complexity Analysis`, ``);
    lines.push(`| Approach | Time | Space | Notes |`);
    lines.push(`|----------|------|-------|-------|`);
    for (const opt of state.complexityOptions) {
      const chosen = opt.id === state.chosenApproachId ? " ✅" : "";
      lines.push(`| ${opt.approach}${chosen} | ${opt.time} | ${opt.space} | ${opt.notes ?? "—"} |`);
    }
    lines.push(``);
  }

  if (state.pseudocode.trim()) {
    lines.push(`## Pseudocode`, ``, "```", state.pseudocode.trim(), "```", ``);
  }

  return lines.join("\n");
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDesignProcess(problem: string) {
  const [state, dispatch] = useReducer(reducer, problem, buildInitialState);

  // ── Metrics (derived, memoised) ───────────────────────────────────────────
  const metrics = useMemo<Metrics>(() => {
    const sorted = [...state.phases].sort((a, b) => a.order - b.order);

    const phaseStatuses: PhaseStatus[] = sorted.map((p) => {
      const total = p.tasks.length;
      const completed = p.tasks.filter((t) => t.completed).length;
      const isComplete = total > 0 && completed === total;
      return {
        phaseId: p.id,
        title: p.title,
        totalTasks: total,
        completedTasks: completed,
        isComplete,
        progressPercent: total === 0 ? 0 : Math.round((completed / total) * 100),
      };
    });

    const allTasks = state.phases.flatMap((p) => p.tasks);
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter((t) => t.completed).length;
    const progressPercent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    const currentPhase = sorted.find((p) => {
      const status = phaseStatuses.find((s) => s.phaseId === p.id);
      return !status?.isComplete;
    }) ?? null;

    const isReadyToCode = sorted
      .filter((p) => p.isPreCoding)
      .every((p) => phaseStatuses.find((s) => s.phaseId === p.id)?.isComplete === true);

    return { progressPercent, phaseStatuses, currentPhase, isReadyToCode };
  }, [state.phases]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const toggleTask = useCallback((phaseId: string, taskId: string) => {
    dispatch({ type: "TOGGLE_TASK", phaseId, taskId });
  }, []);

  const addTask = useCallback((phaseId: string, title: string, description?: string) => {
    dispatch({ type: "ADD_TASK", phaseId, title, description });
  }, []);

  const removeTask = useCallback((phaseId: string, taskId: string) => {
    dispatch({ type: "REMOVE_TASK", phaseId, taskId });
  }, []);

  const updateTask = useCallback(
    (phaseId: string, taskId: string, patch: Partial<Pick<Task, "title" | "description" | "completed">>) => {
      dispatch({ type: "UPDATE_TASK", phaseId, taskId, patch });
    },
    [],
  );

  const addPhase = useCallback(
    (title: string, options?: { isPreCoding?: boolean; tasks?: Array<Pick<Task, "title" | "description">> }) => {
      dispatch({ type: "ADD_PHASE", title, isPreCoding: options?.isPreCoding, tasks: options?.tasks });
    },
    [],
  );

  const removePhase = useCallback((phaseId: string) => {
    dispatch({ type: "REMOVE_PHASE", phaseId });
  }, []);

  const addComplexityOption = useCallback((option: Omit<ComplexityOption, "id">) => {
    dispatch({ type: "ADD_COMPLEXITY", option });
  }, []);

  const removeComplexityOption = useCallback((optionId: string) => {
    dispatch({ type: "REMOVE_COMPLEXITY", optionId });
  }, []);

  const setPseudocode = useCallback((content: string) => {
    dispatch({ type: "SET_PSEUDOCODE", content });
  }, []);

  const setChosenApproach = useCallback((optionId: string | null) => {
    dispatch({ type: "SET_CHOSEN_APPROACH", optionId });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const exportSummary = useCallback(() => {
    return buildMarkdownSummary(state, metrics);
  }, [state, metrics]);

  return {
    state,
    metrics,
    actions: {
      toggleTask,
      addTask,
      removeTask,
      updateTask,
      addPhase,
      removePhase,
      addComplexityOption,
      removeComplexityOption,
      setPseudocode,
      setChosenApproach,
      reset,
      exportSummary,
    },
  };
}
