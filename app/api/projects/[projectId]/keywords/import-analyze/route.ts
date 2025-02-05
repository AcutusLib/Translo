import { getServerSession } from "next-auth/next"
import * as z from "zod"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { handleCatchApi } from "@/lib/exceptions"
import i18n from "@/lib/i18n"
import { ErrorResponse } from "@/lib/response"
import { LOGOUT_STATUS, NOT_ALLOWED_STATUS } from "@/app/api/status"

import {
  routeContextSchemaProject,
  verifyCurrentUserHasAccessToProject,
} from "../../utils"

const keywordImportSchema = z.object({
  keywords: z.array(z.string()),
})

export async function POST(
  req: Request,
  context: z.infer<typeof routeContextSchemaProject>
) {
  try {
    const params = await routeContextSchemaProject.parse(context).params

    if (!(await verifyCurrentUserHasAccessToProject(params.projectId))) {
      return ErrorResponse({
        error: i18n.t("Wrong user"),
        status: NOT_ALLOWED_STATUS,
      })
    }

    const session = await getServerSession(authOptions)

    if (!session) {
      return new Response("Unauthorized", { status: LOGOUT_STATUS })
    }

    const json = await req.json()
    const body = keywordImportSchema.parse(json)

    const keywordsAlreadyExists = await db.keyword.findMany({
      where: {
        keyword: {
          in: body.keywords,
        },
        translations: {
          every: {
            projectLanguageId: {
              equals: params.projectId,
            },
          },
        },
      },
    })

    return new Response(JSON.stringify(keywordsAlreadyExists))
  } catch (error) {
    return handleCatchApi(error)
  }
}
