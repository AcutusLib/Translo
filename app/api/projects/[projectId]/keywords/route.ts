import { getServerSession } from "next-auth/next"
import * as z from "zod"

import { AlertType } from "@/types/api"
import { authOptions } from "@/lib/auth"
import { MAX_KEYWORDS_STARTER_URSER } from "@/lib/constants"
import { db } from "@/lib/db"
import { handleCatchApi } from "@/lib/exceptions"
import i18n from "@/lib/i18n"
import { ErrorResponse } from "@/lib/response"
import { isUserPro } from "@/lib/subscription"
import {
  LOGOUT_STATUS,
  NOT_ALLOWED_STATUS,
  PAYMENT_REQUIRED_STATUS,
} from "@/app/api/status"

import {
  routeContextSchemaProject,
  verifyCurrentUserHasAccessToProject,
} from "../utils"

const keywordCreateSchema = z.object({
  keyword: z.string(),
  context: z.string().optional(),
})

const getAllKeywordsByProject = async (projectId: string) => {
  const keywords = await db.keyword.findMany({
    select: {
      id: true,
      keyword: true,
      projectId: true,
      context: true,
      translations: true,
      rephrase: true,
    },
    where: {
      projectId: projectId,
    },
    orderBy: {
      keyword: "asc",
    },
  })
  return keywords
}

export async function GET(
  _req: Request,
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

    const result = await getAllKeywordsByProject(params.projectId)
    return new Response(JSON.stringify(result))
  } catch (error) {
    return handleCatchApi(error)
  }
}

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
    const body = keywordCreateSchema.parse(json)

    const isPro = await isUserPro()

    if (!isPro) {
      const keywords = await getAllKeywordsByProject(params.projectId)
      if (keywords.length > MAX_KEYWORDS_STARTER_URSER) {
        return ErrorResponse({
          error: i18n.t("Limit of {number} keywords reached.", {
            number: MAX_KEYWORDS_STARTER_URSER,
          }),
          description: i18n.t("Please upgrade to the PRO plan."),
          status: PAYMENT_REQUIRED_STATUS,
          alertType: AlertType.keywordsSubscriptionNeeded,
        })
      }
    }

    const keyword = await db.keyword.create({
      data: {
        keyword: body.keyword,
        context: body.context || "",
        projectId: params.projectId,
      },
      select: {
        id: true,
      },
    })

    return new Response(JSON.stringify(keyword))
  } catch (error) {
    return handleCatchApi(error)
  }
}
