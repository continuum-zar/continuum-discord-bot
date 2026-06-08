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

export type ReviewRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type ReviewVerdict = 'ready_to_merge' | 'issues_found';

export type ReviewDeliveryTarget = 'github_pr_comment' | 'task_comment';

export interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor';
  title: string;
  detail: string;
  file?: string | null;
  line?: number | null;
}

export interface ReviewRun {
  id: string;
  build_run_id: string;
  task_id: number;
  status: ReviewRunStatus;
  verdict: ReviewVerdict | null;
  summary: string | null;
  issues: ReviewIssue[];
  delivery_target: ReviewDeliveryTarget;
  github_comment_url: string | null;
  task_comment_id: number | null;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type GlobalRole = 'admin' | 'project_manager' | 'developer' | 'client';

export interface MeUser {
  id: number;
  username?: string | null;
  display_name?: string | null;
  role: GlobalRole;
  email?: string | null;
}

export type ProjectMemberRole = 'client' | 'developer' | 'project_manager';

export interface ProjectMemberUser {
  id: number;
  display_name?: string | null;
  username?: string | null;
  email?: string | null;
}

export interface ProjectMember {
  id: number;
  user_id: number;
  role: ProjectMemberRole | string;
  added_at?: string;
  user?: ProjectMemberUser | null;
}

export type TaskPriority = 'high' | 'medium' | 'low' | 'info';

export interface TaskUpdateInput {
  title?: string;
  description?: string;
  due_date?: string;
  scope_weight?: 'XS' | 'S' | 'M' | 'L' | 'XL';
  priority?: TaskPriority;
  estimated_hours?: number;
  labels?: string[];
}

export type WorkSessionStatus = 'active' | 'paused' | 'completed';

export interface WorkSession {
  id: number;
  user_id: number;
  project_id: number;
  task_id?: number | null;
  started_at: string;
  ended_at?: string | null;
  last_resumed_at?: string | null;
  duration_seconds: number;
  status: WorkSessionStatus;
  note?: string | null;
  current_duration_seconds?: number;
}

export interface LoggedHourCreateInput {
  project_id: number;
  task_id?: number;
  hours?: number;
  duration_minutes?: number;
  description: string;
  date: string;
}

export interface LoggedHour {
  id: number;
  user_id: number;
  project_id: number;
  task_id?: number | null;
  hours: number;
  description?: string | null;
  date?: string | null;
  task_title?: string | null;
  project_name?: string | null;
}

export interface PendingInvitation {
  id: number;
  project_id: number;
  project_name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  inviter_name?: string | null;
}

export interface IssueReport {
  id: number;
  message: string;
  user_id?: number | null;
  contact_email?: string | null;
  created_at: string;
}

export interface MilestoneCreateInput {
  project_id: number;
  name: string;
  due_date?: string;
  description?: string;
}

export interface MilestoneUpdateInput {
  name?: string;
  due_date?: string;
  description?: string;
}

export interface AssignTaskInput {
  user_ids: number[];
}

export interface InviteMemberInput {
  email: string;
  role: ProjectMemberRole;
}
