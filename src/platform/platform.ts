export interface GamePlatform {
  readonly name: string;
  readonly hosted: boolean;
  init(): Promise<void>;
  loadingProgress(value: number): void;
  gameplayStart(): void;
  gameplayStop(): void;
  happyTime(): void;
}

class WebPlatform implements GamePlatform {
  name = 'web';
  hosted = false;

  async init(): Promise<void> {
    return undefined;
  }

  loadingProgress(_value: number): void {
    return undefined;
  }

  gameplayStart(): void {
    return undefined;
  }

  gameplayStop(): void {
    return undefined;
  }

  happyTime(): void {
    return undefined;
  }
}

export const platform: GamePlatform = new WebPlatform();
