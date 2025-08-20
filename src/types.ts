/**
 * Mapping d'un contrôle logique vers une action d'application.
 */
export interface ControlMapping {
  /** Clé d'application (ex: "obs") */
  app: string;
  /** Nom d'action (ex: "toggleStudioMode", "changeScene") */
  action: string;
  /** Paramètres passés à l'action */
  params?: unknown[];
  /**
   * Spécification optionnelle d'un indicateur (LED) à allumer/éteindre
   * en fonction d'un signal publié par le driver.
   * Exemple: { signal: "obs.studioMode", equals: true }
   */
  indicator?: ControlIndicatorConfig;
}

export interface ExecutionContext {
  controlId: string;
  value?: number | string | boolean | unknown;
}

/**
 * Décrit une condition d'allumage pour un contrôle basé sur un signal nommé.
 */
export interface ControlIndicatorConfig {
  /** Nom du signal (ex: "obs.studioMode", "obs.currentProgramScene") */
  signal: string;
  /** Valeur d'égalité stricte attendue pour allumer la LED */
  equals?: unknown;
  /** Tableau de valeurs acceptées pour allumer la LED */
  in?: unknown[];
  /** Si défini, allume si la valeur est truthy (ignorer equals/in) */
  truthy?: boolean;
}

export interface Driver {
  readonly name: string;
  init(): Promise<void>;
  execute(action: string, params: unknown[], context?: ExecutionContext): Promise<void>;
  sendInitialFeedback?(): Promise<void>;
  onConfigChanged?(): Promise<void>;
  /**
   * Optionnel: Demande au driver de se resynchroniser avec la réalité externe.
   * Typiquement, relire les états courants et/ou republier les signaux initiaux.
   */
  sync?(): Promise<void>;
  /**
   * Optionnel: Permet au driver de publier des signaux nommés (observables)
   * vers la couche d'indicateurs génériques.
   */
  subscribeIndicators?(emit: (signal: string, value: unknown) => void): () => void;
  shutdown?(): Promise<void>;
}
