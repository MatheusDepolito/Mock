import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * Test-only DTO. `name` carries two failing constraints at once (used to
 * assert that Problem Details groups multiple messages under one field),
 * `email` carries a single one on a different field.
 */
export class ValidationTestDto {
  @IsString()
  @MinLength(5)
  name!: string;

  @IsEmail()
  email!: string;
}
