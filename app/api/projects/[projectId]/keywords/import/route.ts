import { Prisma } from "@prisma/client"
import { getServerSession } from "next-auth/next"
import * as z from "zod"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { handleCatchApi } from "@/lib/exceptions"
import i18n from "@/lib/i18n"
import { ErrorResponse, SuccessResponse } from "@/lib/response"

import {
  routeContextSchemaProject,
  verifyCurrentUserHasAccessToProject,
} from "../../route"

const keywordImportSchema = z.object({
  keywords: z.record(z.string()),
  languageId: z.string(),
})

export async function POST(
  req: Request,
  context: z.infer<typeof routeContextSchemaProject>
) {
  try {
    const { params } = routeContextSchemaProject.parse(context)

    if (!(await verifyCurrentUserHasAccessToProject(params.projectId))) {
      return ErrorResponse({ error: i18n.t("Wrong user"), status: 403 })
    }

    const session = await getServerSession(authOptions)

    if (!session) {
      return new Response("Unauthorized", { status: 403 })
    }

    const json = await req.json()
    const body = keywordImportSchema.parse(json)

    const projectLanguageId = await db.projectLanguage.findUnique({
      where: {
        id: body.languageId,
      },
      select: {
        id: true,
      },
    })

    if (!projectLanguageId) {
      return ErrorResponse({ error: i18n.t("Language not found"), status: 404 })
    }

    type keywordAlreadyExistsType = {
      id: string
      keyword: string
      translations: {
        projectLanguageId: string
      }[]
    }

    const keywordsAlreadyExists: keywordAlreadyExistsType[] =
      await db.keyword.findMany({
        where: {
          keyword: {
            in: Object.keys(body.keywords),
          },
          projectId: params.projectId,
        },
        select: {
          id: true,
          keyword: true,
          translations: {
            select: {
              projectLanguageId: true,
            },
          },
        },
      })

    const translationExists = (keyword: keywordAlreadyExistsType) =>
      keyword.translations.find(
        (translation) => translation.projectLanguageId === projectLanguageId.id
      )

    const translationToUpdate = keywordsAlreadyExists
      .filter(translationExists)
      .map((keyword) => ({
        keyword: keyword.keyword,
        id: keyword.id,
        value: body.keywords[keyword.keyword],
      }))

    const translationToCreate = keywordsAlreadyExists
      .filter((key) => !translationExists(key))
      .map((keyword) => ({
        keyword: keyword.keyword,
        id: keyword.id,
        value: body.keywords[keyword.keyword],
      }))

    const keywordsToCreate = Object.keys(body.keywords).filter((keyword) => {
      const translationToUpdateKeywords = translationToUpdate.map(
        (keyword) => keyword.keyword
      )
      const translationToCreateKeywords = translationToCreate.map(
        (keyword) => keyword.keyword
      )
      if (
        keyword.length > 0 &&
        !translationToUpdateKeywords.includes(keyword) &&
        !translationToCreateKeywords.includes(keyword)
      ) {
        return true
      }
      return false
    })

    if (translationToUpdate.length) {
      await db.translation.deleteMany({
        where: {
          keywordId: {
            in: translationToUpdate.map((keyword) => keyword.id),
          },
          projectLanguageId: projectLanguageId.id,
        },
      })

      await db.$queryRaw`
      INSERT INTO "translations" ("id", "keywordId", "projectLanguageId", "value")
      VALUES ${Prisma.join(
        translationToUpdate.map(
          (keyword) =>
            Prisma.sql`(gen_random_uuid(), ${Prisma.join([
              keyword.id,
              projectLanguageId.id,
              body.keywords[keyword.keyword],
            ])})`
        )
      )}`
    }

    if (translationToCreate.length) {
      await db.$queryRaw`
      INSERT INTO "translations" ("id", "keywordId", "projectLanguageId", "value")
      VALUES ${Prisma.join(
        translationToCreate.map(
          (keyword) =>
            Prisma.sql`(gen_random_uuid(), ${Prisma.join([
              keyword.id,
              projectLanguageId.id,
              body.keywords[keyword.keyword],
            ])})`
        )
      )}`
    }

    if (keywordsToCreate.length) {
      const keywordIds: { id: string }[] = await db.$queryRaw`
      INSERT INTO "keywords" ("id", "keyword", "projectId", "context")
      VALUES ${Prisma.join(
        keywordsToCreate.map(
          (keywordToCreate) =>
            Prisma.sql`(gen_random_uuid(), ${Prisma.join([
              keywordToCreate,
              params.projectId,
              "",
            ])})`
        )
      )}
      RETURNING id`

      if (keywordIds.length !== keywordsToCreate.length) {
        return ErrorResponse({ error: i18n.t("Error creating keywords") })
      }

      await db.$queryRaw`
      INSERT INTO "translations" ("id", "keywordId", "projectLanguageId", "value")
      VALUES ${Prisma.join(
        keywordsToCreate.map(
          (keywordToCreate, index) =>
            Prisma.sql`(gen_random_uuid(), ${Prisma.join([
              keywordIds[index].id,
              projectLanguageId.id,
              body.keywords[keywordToCreate],
            ])})`
        )
      )}`
    }

    return SuccessResponse()
  } catch (error) {
    return handleCatchApi(error)
  }
}
