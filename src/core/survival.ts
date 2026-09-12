export const STAT_MAX = 20;

export class Survival {
  health: number;
  hunger: number;
  thirst: number;
  dead: boolean;
  starveTimer: number;
  parchTimer: number;
  regenTimer: number;
  airTimer: number;
  hurtTimer: number;

  constructor() {
    this.health = STAT_MAX;
    this.hunger = STAT_MAX;
    this.thirst = STAT_MAX;
    this.dead = false;
    this.starveTimer = 0;
    this.parchTimer = 0;
    this.regenTimer = 0;
    this.airTimer = 12;
    this.hurtTimer = 0;
  }

  reset(): void {
    this.health = STAT_MAX;
    this.hunger = STAT_MAX;
    this.thirst = STAT_MAX;
    this.dead = false;
    this.starveTimer = 0;
    this.parchTimer = 0;
    this.regenTimer = 0;
    this.airTimer = 12;
    this.hurtTimer = 0;
  }

  damage(amount: number): void {
    if (this.dead || amount <= 0) return;
    this.health = this.health - amount;
    this.hurtTimer = 0.35;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  heal(amount: number): void {
    this.health = this.health + amount;
    if (this.health > STAT_MAX) this.health = STAT_MAX;
  }

  eat(amount: number): void {
    this.hunger = this.hunger + amount;
    if (this.hunger > STAT_MAX) this.hunger = STAT_MAX;
  }

  drink(amount: number): void {
    this.thirst = this.thirst + amount;
    if (this.thirst > STAT_MAX) this.thirst = STAT_MAX;
  }

  fallDamage(fallDistance: number): void {
    if (fallDistance > 4) this.damage(Math.floor(fallDistance - 3));
  }

  tick(dt: number, inWater: boolean, underwater: boolean, sprinting: boolean): void {
    if (this.hurtTimer > 0) this.hurtTimer = this.hurtTimer - dt;
    if (this.dead) return;
    let hungerRate = 0.032;
    let thirstRate = 0.05;
    if (sprinting) {
      hungerRate = 0.06;
      thirstRate = 0.1;
    }
    if (inWater) thirstRate = thirstRate * 0.7;
    this.hunger = this.hunger - dt * hungerRate;
    this.thirst = this.thirst - dt * thirstRate;
    if (this.hunger < 0) this.hunger = 0;
    if (this.thirst < 0) this.thirst = 0;
    if (this.hunger <= 0) {
      this.starveTimer = this.starveTimer + dt;
      if (this.starveTimer >= 4) {
        this.starveTimer = 0;
        this.damage(1);
      }
    } else {
      this.starveTimer = 0;
    }
    if (this.thirst <= 0) {
      this.parchTimer = this.parchTimer + dt;
      if (this.parchTimer >= 3) {
        this.parchTimer = 0;
        this.damage(1);
      }
    } else {
      this.parchTimer = 0;
    }
    if (this.hunger > 16 && this.health < STAT_MAX) {
      this.regenTimer = this.regenTimer + dt;
      if (this.regenTimer >= 5) {
        this.regenTimer = 0;
        this.heal(1);
      }
    } else {
      this.regenTimer = 0;
    }
    if (underwater) {
      this.airTimer = this.airTimer - dt;
      if (this.airTimer <= 0) {
        this.airTimer = 1.5;
        this.damage(2);
      }
    } else {
      this.airTimer = 12;
    }
  }
}
