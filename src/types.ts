/**
 * The /api/v1 bodies the CLI reads and sends, as the server's schemas
 * describe them. Written by hand from those schemas: they aren't generated
 * from the OpenAPI document yet.
 */

/** Something left to do after a request, or a way out of a problem. */
export interface NextStep {
  step: string;
  detail: string;
  url?: string;
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
