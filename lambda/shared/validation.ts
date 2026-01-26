// Input validation utilities
import { ValidationError } from './errors';

export interface ValidationRule<T> {
  validate(value: T): boolean;
  message: string;
}

export class StringValidator {
  private rules: ValidationRule<string>[] = [];

  required(message: string = 'Field is required'): this {
    this.rules.push({
      validate: (value: string) => value != null && value.trim().length > 0,
      message
    });
    return this;
  }

  minLength(min: number, message?: string): this {
    this.rules.push({
      validate: (value: string) => value.length >= min,
      message: message || `Must be at least ${min} characters`
    });
    return this;
  }

  maxLength(max: number, message?: string): this {
    this.rules.push({
      validate: (value: string) => value.length <= max,
      message: message || `Must be no more than ${max} characters`
    });
    return this;
  }

  validate(value: string): void {
    for (const rule of this.rules) {
      if (!rule.validate(value)) {
        throw new ValidationError(rule.message);
      }
    }
  }
}

export const validators = {
  password: () => new StringValidator().required('Password is required'),
  clientPassword: () => new StringValidator().maxLength(100, 'Password must be 100 characters or less')
};