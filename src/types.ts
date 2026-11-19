/**
 * The /api/v1 bodies the CLI reads and sends, as the server's schemas
 * describe them. Written by hand from those schemas: they aren't generated
 * from the OpenAPI document yet.
 */

/** The one API call an agent's step is. */
export interface StepOperation {
  /** The route's operationId. Left off for a route outside the v1 documents. */
  id?: string;
  method: string;
  href: string;
}

/**
 * Something left to do after a request, or a way out of a problem.
 *
 * `title`, `actor` and `operation` come with formspree-server#2338. The
 * server sends the first two on every step once that's deployed. They stay
 * optional until then, while production still sends `{step, detail, url?}`,
 * and for the day after, while an idempotent replay can still be that old.
 */
export interface NextStep {
  /** A snake_case id. Before #2338 some steps had a sentence here. */
  step: string;
  /** A short label for display. */
  title?: string;
  /** Who does it. */
  actor?: 'agent' | 'user';
  /** What to do, written to the actor. */
  detail: string;
  /**
   * A page for a person to open. A user's step always has one and an
   * agent's never does. Before #2338 it could be an API route too.
   */
  url?: string;
  /** On an agent's step that is one API call. */
  operation?: StepOperation;
}

/** One thing wrong with a request body. */
export interface FieldError {
  /** Dotted, like `actions.0.app`; empty for the whole body. */
  path: string;
  message: string;
  allowed?: string[];
}

export interface Account {
  id: string;
  name: string | null;
  kind: 'personal' | 'team';
}

/**
 * An RFC 9457 problem. A few older errors are still only
 * `{ ok: false, error }`, so every field is optional.
 */
export interface Problem {
  /** A URL that ends in the problem's name, like `project-not-empty`. */
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  /** Whether the same request can succeed later, unchanged. */
  retryable?: boolean;
  errors?: FieldError[];
  /** account-required: the accounts to choose from. */
  accounts?: Account[];
  next_steps?: NextStep[];
  error?: string | { message: string; code: string };
}

export interface Project {
  id: string;
  account_id?: string;
  kind: 'cli' | 'dashboard';
  name: string | null;
  timezone: string | null;
  domain_whitelist: string | null;
  links?: { dashboard: string };
}

export type ActionStatus =
  | 'active'
  | 'disabled'
  | 'pending_verification'
  | 'needs_connection'
  | 'upgrade_required';

/** An action as a form reports it. */
export interface FormAction {
  type?: string;
  app?: string;
  to?: string[];
  status: ActionStatus;
}

export type FieldType =
  'text' | 'email' | 'numeric' | 'datetime-local' | 'url' | 'file';

export interface FieldRules {
  required?: boolean;
  type?: FieldType;
  min?: number | string;
  max?: number | string;
  minlength?: number;
  maxlength?: number;
  accept?: string[];
}

export interface Captcha {
  type: 'recaptcha';
}

/** A form as the list returns it. */
export interface FormSummary {
  name: string | null;
  project_id: string | null;
  hashid: string;
  url: string;
  key: string | null;
  links?: { dashboard: string };
}

/** A form as get, create and update return it. */
export interface FormDetail extends FormSummary {
  fields?: Record<string, FieldRules>;
  captcha?: Captcha | null;
  actions?: FormAction[];
  submission_url?: string;
}

/** An action as a create or update sends it. */
export type ActionInput =
  | { type: 'email'; to: string | string[] }
  | { type: 'webhook'; url: string }
  | { type: 'autoresponse'; fromName: string; subject: string; message: string }
  | { app: string };

/** The formspree.json form schema, plus redirect. */
export interface FormBody {
  name?: string;
  key?: string;
  fields?: Record<string, FieldRules>;
  captcha?: Captcha | null;
  actions?: ActionInput[];
  redirect?: string;
}

export interface CreateFormBody extends FormBody {
  project_id?: string;
  project?: string;
  account_id?: string;
}

export interface CreateProjectBody {
  name?: string;
  account_id?: string;
}

export interface AccountsResponse {
  accounts: Account[];
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface ProjectResponse {
  project: Project;
  next_steps?: NextStep[];
}

export interface FormsResponse {
  forms: FormSummary[];
}

export interface FormResponse {
  form: FormDetail;
  next_steps?: NextStep[];
}

export interface SubmissionError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: SubmissionError[];
}
