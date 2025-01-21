import * as z from "zod"

import { db } from "@/lib/db"
import { handleCatchApi } from "@/lib/exceptions"
import i18n from "@/lib/i18n"
import { ErrorResponse, SuccessResponse } from "@/lib/response"
import { NOT_ALLOWED_STATUS } from "@/app/api/status"

import { verifyCurrentUserHasAccessToProject } from "../../../utils"
import { routeContextSchemaProjectKeyword } from "../utils"

const keywordPatchSchema = z.object({
  context: z.string(),
  rephrase: z.boolean().optional(),
})

export async function PATCH(
  req: Request,
  context: z.infer<typeof routeContextSchemaProjectKeyword>
) {
  try {
    const params = await routeContextSchemaProjectKeyword.parse(context).params

    if (!(await verifyCurrentUserHasAccessToProject(params.projectId))) {
      return ErrorResponse({
        error: i18n.t("Wrong user"),
        status: NOT_ALLOWED_STATUS,
      })
    }

    const json = await req.json()
    const body = keywordPatchSchema.parse(json)

    await db.keyword.update({
      where: {
        id: params.keywordId,
      },
      data: {
        context: body.context,
        rephrase: body.rephrase,
      },
    })

    return SuccessResponse()
  } catch (error) {
    return handleCatchApi(error)
  }
}
