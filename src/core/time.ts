import { Rnd } from './noise';

export const WEATHER_CLEAR = 0;
export const WEATHER_RAIN = 1;
export const WEATHER_SNOW = 2;
export const WEATHER_STORM = 3;

export class TimeState {
  hour: number;
  day: number;

  constructor(hour: number) {
    this.hour = hour;
    this.day = 1;
  }

  advance(dt: number): void {
    this.hour = this.hour + dt * 0.05;
    while (this.hour >= 24) {
      this.hour = this.hour - 24;
      this.day = this.day + 1;
    }
  }

  sunAngle(): number {
    return ((this.hour - 6) / 12) * Math.PI;
  }

  daylight(): number {
    const s = Math.sin(this.sunAngle());
    let value = 0.2 + s * 1.3;
    if (value < 0.07) value = 0.07;
    if (value > 1) value = 1;
    return value;
  }

  isNight(): boolean {
    return this.hour < 5.5 || this.hour > 18.5;
  }

  sunDirX(): number {
    return -Math.cos(this.sunAngle()) * 0.94;
  }

  sunDirY(): number {
    return Math.sin(this.sunAngle());
  }

  sunDirZ(): number {
    return 0.34;
  }
}

export class WeatherState {
  weather: number;
  timer: number;
  intensity: number;
  flash: number;
  boltTimer: number;
  rnd: Rnd;

  constructor() {
    this.weather = WEATHER_CLEAR;
    this.timer = 150;
    this.intensity = 0;
    this.flash = 0;
    this.boltTimer = 6;
    this.rnd = new Rnd();
  }

  advance(dt: number, cold: boolean): void {
    this.timer = this.timer - dt;
    if (this.flash > 0) this.flash = this.flash - dt * 2.5;
    if (this.flash < 0) this.flash = 0;
    if (this.weather === WEATHER_STORM) {
      this.boltTimer = this.boltTimer - dt;
      if (this.boltTimer <= 0) {
        this.boltTimer = 3 + this.rnd.next() * 9;
        this.flash = 1;
      }
    }
    if (this.timer > 0) return;
    const roll = this.rnd.next();
    if (this.weather === WEATHER_CLEAR) {
      if (roll < 0.5) {
        this.timer = 120 + this.rnd.next() * 180;
      } else if (cold) {
        this.weather = WEATHER_SNOW;
        this.timer = 50 + this.rnd.next() * 70;
        this.intensity = 0.4 + this.rnd.next() * 0.6;
      } else if (roll < 0.82) {
        this.weather = WEATHER_RAIN;
        this.timer = 50 + this.rnd.next() * 90;
        this.intensity = 0.3 + this.rnd.next() * 0.7;
      } else {
        this.weather = WEATHER_STORM;
        this.timer = 35 + this.rnd.next() * 45;
        this.intensity = 0.7 + this.rnd.next() * 0.3;
        this.boltTimer = 2 + this.rnd.next() * 6;
      }
    } else {
      this.weather = WEATHER_CLEAR;
      this.timer = 120 + this.rnd.next() * 200;
      this.intensity = 0;
    }
  }

  skyDim(): number {
    if (this.weather === WEATHER_STORM) return 0.45;
    if (this.weather === WEATHER_RAIN) return 0.62;
    if (this.weather === WEATHER_SNOW) return 0.78;
    return 1;
  }

  precipitating(): boolean {
    return this.weather === WEATHER_RAIN || this.weather === WEATHER_SNOW || this.weather === WEATHER_STORM;
  }
}
