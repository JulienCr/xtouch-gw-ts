export interface ControlMapping {
  app: string;
  action: string;
  params?: unknown[];
}

export interface ExecutionContext {
  controlId: string;
  value?: number | string | boolean | unknown;
}

export interface Driver {
  readonly name: string;
  init(): Promise<void>;
  execute(action: string, params: unknown[], context?: ExecutionContext): Promise<void>;
  sendInitialFeedback?(): Promise<void>;
  onConfigChanged?(): Promise<void>;
  shutdown?(): Promise<void>;
}
