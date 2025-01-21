import { NextRequest } from "next/server"
import { generatePromptTranslation, OpenAIHelper } from "@/utils/OpenAiUtils"
import { getServerSession } from "next-auth/next"
import * as z from "zod"

import { AlertType } from "@/types/api"
import {
  eventUserDo,
  sendServerPostHogEvent,
  UserDoAction,
} from "@/lib/analytics-server"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { handleCatchApi } from "@/lib/exceptions"
import i18n from "@/lib/i18n"
import { ErrorResponse } from "@/lib/response"
import { ProjectSettings } from "@/components/app/project/types"

import { verifyCurrentUserHasAccessToProject } from "../projects/[projectId]/utils"
import { LOGOUT_STATUS, NOT_ALLOWED_STATUS } from "../status"

const generateTranslationSchema = z.object({
  projectId: z.string(),
  keywordId: z.string(),
  sentence: z.string(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session) {
      return new Response("Unauthorized", { status: LOGOUT_STATUS })
    }

    const user = await db.user.findFirst({
      where: {
        id: session.user.id,
      },
    })

    if (!user) {
      return new Response(i18n.t("User not found"), {
        status: NOT_ALLOWED_STATUS,
      })
    }

    if (user.tokens < 0) {
      return ErrorResponse({
        error: i18n.t(
          "You don't have any more tokens to perform automatic translations"
        ),
        description: i18n.t("Please recharge your tokens"),
        alertType: AlertType.tokensRechargeNeeded,
      })
    }

    const searchParams = req.nextUrl.searchParams

    const { keywordId, projectId, sentence } = generateTranslationSchema.parse({
      projectId: searchParams.get("projectId"),
      keywordId: searchParams.get("keywordId"),
      sentence: searchParams.get("sentence"),
    })

    // Check if the user has access to this project.
    if (!(await verifyCurrentUserHasAccessToProject(projectId))) {
      return ErrorResponse({
        error: i18n.t("Wrong user"),
        status: NOT_ALLOWED_STATUS,
      })
    }

    const project = await db.project.findFirst({
      where: {
        id: projectId,
      },
      include: {
        languages: true,
      },
    })

    const keywordDB = await db.keyword.findFirst({
      where: {
        id: keywordId,
      },
    })

    if (!project) {
      return ErrorResponse({
        error: i18n.t("The project does not exist or is not published"),
      })
    }

    if (!keywordDB) {
      return ErrorResponse({
        error: i18n.t("The keyword does not exist"),
      })
    }

    const languagesPropt = project.languages
      .map((language) => language.short)
      .join(", ")

    const settings = project.settings as ProjectSettings

    let agePrompt = ""

    if (settings.ageStart && settings.ageEnd) {
      agePrompt = `with an age range between ${settings.ageStart} and ${settings.ageEnd} years old.`
    } else if (settings.ageStart) {
      agePrompt = `with an age from ${settings.ageStart}.`
    } else if (settings.ageEnd) {
      agePrompt = `with an age up to ${settings.ageEnd}.`
    }

    try {
      const prompt = generatePromptTranslation({
        translationEn: sentence,
        context: keywordDB.context,
        languagesPropt: languagesPropt,
        settings,
        agePrompt,
        languages: project.languages,
        rephrase: keywordDB.rephrase,
      })

      const openaiHelper = new OpenAIHelper()
      const chatGptResponse = await openaiHelper.askChatGPT({
        prompt,
      })
      // uncomment to debug real usage
      // console.log("chatGptResponse", chatGptResponse)
      const jsonString = openaiHelper.getResponseJSONString(chatGptResponse)
      const result = openaiHelper.parseChatGPTJSONString<{
        [shortLang: string]: string
      }>(jsonString)
      if (result) {
        const response = JSON.stringify(
          Object.keys(result).reduce(
            (acc, key) => {
              acc[key] =
                typeof result[key] === "object"
                  ? JSON.stringify(result[key])
                  : result[key]
              return acc
            },
            { chatGptPrompt: prompt }
          )
        )

        // in case we fail to use the real usage statistics we fallback to the length of the prompt and response
        const cost =
          chatGptResponse.usage?.total_tokens || prompt.length + response.length

        await db.user.update({
          where: {
            id: user.id,
          },
          data: {
            tokens: Number(user.tokens) - cost,
          },
        })

        sendServerPostHogEvent((client) => {
          eventUserDo(user.id, client, UserDoAction.generateFromAI, {
            cost,
          })
        })

        await db.aiTranslationsLog.create({
          data: {
            cost,
            userId: user.id,
          },
        })

        return new Response(response)
      }
      throw new Error("Failed to get response from Chat GPT.")
    } catch (e) {
      throw new Error(e)
    }
  } catch (error) {
    return handleCatchApi(error)
  }
}
