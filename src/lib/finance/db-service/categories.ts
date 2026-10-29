import { and, eq, or } from 'drizzle-orm';
import { db, finCategories } from '@src/lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '@src/app/api/utils';
import {
  type CategoryDTO,
  type CategoryFilters,
  type CreateCategoryDTO,
  type UpdateCategoryDTO,
  createCategorySchema,
  updateCategorySchema,
} from '../contract';

export function mapCategoryToDTO(row: typeof finCategories.$inferSelect): CategoryDTO {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type as CategoryDTO['type'],
    parentId: row.parentId,
    icon: row.icon,
    color: row.color,
    isSystem: row.isSystem,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export async function listCategories(
  userId: string,
  filters?: CategoryFilters
): Promise<CategoryDTO[]> {
  const userOrSystem = or(eq(finCategories.userId, userId), eq(finCategories.isSystem, true));
  const conditions = [userOrSystem];

  if (filters?.type) {
    conditions.push(eq(finCategories.type, filters.type));
  }

  const rows = await db
    .select()
    .from(finCategories)
    .where(and(...conditions))
    .orderBy(finCategories.isSystem, finCategories.name);

  return rows.map(mapCategoryToDTO);
}

export async function getCategory(userId: string, categoryId: string): Promise<CategoryDTO> {
  const [row] = await db
    .select()
    .from(finCategories)
    .where(
      and(
        eq(finCategories.id, categoryId),
        or(eq(finCategories.userId, userId), eq(finCategories.isSystem, true))
      )
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError(`Category not found: ${categoryId}`);
  }

  return mapCategoryToDTO(row);
}

export async function createCategory(
  userId: string,
  data: CreateCategoryDTO
): Promise<CategoryDTO> {
  const validated = createCategorySchema.parse(data);

  if (validated.parentId) {
    const parent = await getCategory(userId, validated.parentId);
    if (parent.type !== validated.type) {
      throw new BadRequestError('Parent category must have the same type (expense or income)');
    }
  }

  const [row] = await db
    .insert(finCategories)
    .values({
      userId,
      name: validated.name,
      type: validated.type,
      parentId: validated.parentId || null,
      icon: validated.icon || null,
      color: validated.color || null,
      isSystem: false,
    })
    .returning();

  return mapCategoryToDTO(row);
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  data: UpdateCategoryDTO
): Promise<CategoryDTO> {
  const validated = updateCategorySchema.parse(data);
  const existing = await getCategory(userId, categoryId);

  if (existing.isSystem) {
    throw new ForbiddenError('System categories cannot be modified');
  }

  if (existing.userId !== userId) {
    throw new NotFoundError(`Category not found: ${categoryId}`);
  }

  if (validated.parentId) {
    if (validated.parentId === categoryId) {
      throw new BadRequestError('A category cannot be its own parent');
    }
    const parent = await getCategory(userId, validated.parentId);
    if (parent.type !== existing.type) {
      throw new BadRequestError('Parent category must have the same type');
    }
  }

  const updateValues: Partial<typeof finCategories.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (validated.name !== undefined) updateValues.name = validated.name;
  if (validated.parentId !== undefined) updateValues.parentId = validated.parentId;
  if (validated.icon !== undefined) updateValues.icon = validated.icon;
  if (validated.color !== undefined) updateValues.color = validated.color;

  const [updated] = await db
    .update(finCategories)
    .set(updateValues)
    .where(and(eq(finCategories.id, categoryId), eq(finCategories.userId, userId)))
    .returning();

  return mapCategoryToDTO(updated);
}

export async function deleteCategory(userId: string, categoryId: string): Promise<void> {
  const existing = await getCategory(userId, categoryId);

  if (existing.isSystem) {
    throw new ForbiddenError('System categories cannot be deleted');
  }

  if (existing.userId !== userId) {
    throw new NotFoundError(`Category not found: ${categoryId}`);
  }

  // Any child categories referencing this parentId will have parentId unset
  await db
    .update(finCategories)
    .set({ parentId: null, updatedAt: new Date() })
    .where(eq(finCategories.parentId, categoryId));

  await db
    .delete(finCategories)
    .where(and(eq(finCategories.id, categoryId), eq(finCategories.userId, userId)));
}
