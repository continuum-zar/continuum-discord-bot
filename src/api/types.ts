export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  team_size: number;
  last_active: string;
  member_role: string | null;
  client_id: number | null;
}

export interface TaskSummary {
  id: number;
  title: string;
  status: string;
  project_id: number;
  assigned_to: number | null;
  due_date: string | null;
  scope_weight: string | null;
  milestone_id: number | null;
  labels?: string[];
}

export interface ChecklistItem {
  id?: string | null;
  text: string;
  done: boolean;
}

export interface CommentAuthor {
  id: number;
  display_name?: string | null;
  username?: string | null;
}

export interface Comment {
  id: number;
  content: string;
  author: CommentAuthor;
  created_at: string;
}

export interface TaskBranch {
  linked_repo: string;
  linked_branch: string;
  linked_branch_full_ref?: string | null;
  identifier: string;
}

export interface TaskCursorMcpDetail {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  checklists: ChecklistItem[];
  branch: TaskBranch | null;
  comments: Comment[];
}

export interface ProjectStatistics {
  total_tasks: number;
  total_completed_tasks: number;
  total_in_progress_tasks: number;
  total_todo_tasks: number;
  total_overdue_tasks?: number;
  total_logged_hours?: number;
}

export interface ProjectHealth {
  score?: number;
  status?: string;
  summary?: string;
  [key: string]: unknown;
}

export interface RiskItem {
  category?: string;
  severity?: string;
  description?: string;
  [key: string]: unknown;
}

export interface ProjectSnapshot {
  stats: ProjectStatistics;
  health: ProjectHealth;
  risks: RiskItem[];
  structural_commits?: unknown[];
}

export interface ProjectQueryResponse {
  answer: string;
  confidence?: number;
  sources?: Array<{ task_id?: number; title?: string; snippet?: string }>;
}

export interface CreateTaskInput {
  title: string;
  project_id: number;
  scope_weight: 'XS' | 'S' | 'M' | 'L' | 'XL';
  description?: string;
  status?: 'todo' | 'in_progress' | 'done';
  due_date?: string;
  assigned_to?: number;
  labels?: string[];
  milestone_id?: number | null;
}

export interface Milestone {
  id: number;
  project_id: number;
  name: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue';
  due_date: string | null;
  description?: string | null;
}

export interface MilestoneList {
  data: Milestone[];
  total: number;
  skip: number;
  limit: number;
}

export interface GeneratedTaskChecklistItem {
  title: string;
  is_completed?: boolean;
}

export interface GeneratedTask {
  title: string;
  description?: string | null;
  scope_weight: 'XS' | 'S' | 'M' | 'L' | 'XL';
  priority?: 'high' | 'medium' | 'low' | 'info';
  estimated_hours?: number | null;
  rationale: string;
  relevant_files: string[];
  checklist: GeneratedTaskChecklistItem[];
  labels?: string[];
}

export interface GenerateTasksResponse {
  project_id: number;
  prompt: string;
  tasks: GeneratedTask[];
  source_files_used: string[];
  confidence: number;
  reply?: string | null;
}

export interface WikiConfirmTaskItem {
  title: string;
  description?: string | null;
  status?: 'todo' | 'in_progress' | 'done';
  project_id: number;
  milestone_id?: number | null;
  priority?: 'high' | 'medium' | 'low' | 'info';
  scope_weight: 'XS' | 'S' | 'M' | 'L' | 'XL';
  estimated_hours?: number | null;
  checklists?: Array<{ text: string; done?: boolean }> | null;
  labels?: string[] | null;
}

export interface ConfirmTasksResponse {
  created_count: number;
  task_ids: number[];
}

export interface Repository {
  id: number;
  name: string;
  provider: string;
  full_name?: string | null;
  default_branch?: string | null;
}

export interface BranchSummary {
  name: string;
  is_default?: boolean;
  protected?: boolean;
}

export interface LinkBranchInput {
  linked_repo: string;
  linked_branch: string;
  linked_branch_full_ref?: string;
}

export interface CreateBranchInput {
  name: string;
  from_ref?: string;
}

export interface CreateBranchResponse {
  name: string;
  ref?: string;
  sha?: string;
  created?: boolean;
}

export interface AttachLinkInput {
  name: string;
  url: string;
}

export interface AttachmentResponse {
  id: number;
  name: string;
  url: string;
}

export type AgentRunMode = 'open_pr' | 'direct_push';

export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface StartBuildInput {
  linked_repo: string;
  linked_branch: string;
  mode: AgentRunMode;
  instructions?: string;
}

export interface AgentRun {
  id: string;
  task_id: number;
  status: AgentRunStatus;
  mode: AgentRunMode;
  linked_repo: string;
  linked_branch: string;
  pr_url?: string | null;
  commit_sha?: string | null;
  summary?: string | null;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
}
