import sha256 from "crypto-js/sha256"
import { z } from "zod"

import { env } from "@/env.mjs"
import { db } from "@/lib/db"
import { handleCatchApi } from "@/lib/exceptions"
import i18n from "@/lib/i18n"
import { ErrorResponse, SuccessResponse } from "@/lib/response"
import { stripe } from "@/lib/stripe"

const emailVerificationSchema = z.object({
  token: z.string(),
  email: z.string(),
})

export async function POST(req: Request) {
  try {
    const json = await req.json()
    const body = emailVerificationSchema.parse(json)
    const users = await db.user.findMany({
      where: {
        email: {
          contains: body.email,
        },
        emailVerificationToken: {
          contains: body.token,
        },
      },
    })

    if (users.length) {
      const user = users[0]
      const stripeId =
        env.TEST_MODE_ENABLED === "true"
          ? { id: sha256(body.email).toString() }
          : await stripe.customers.create({
              email: user.email,
            })

      const result = await db.user.updateMany({
        where: {
          AND: [
            {
              email: {
                contains: body.email,
              },
            },
            {
              emailVerificationToken: {
                contains: body.token,
              },
            },
          ],
        },
        data: {
          emailVerificationToken: null,
          emailVerified: new Date(),
          stripeCustomerId: stripeId.id,
        },
      })

      if (!result.count) {
        return ErrorResponse({
          error: i18n.t("The token does not match. Please try again."),
        })
      }
    } else {
      return ErrorResponse({
        error: i18n.t("The token does not match. Please try again."),
      })
    }

    return SuccessResponse()
  } catch (error) {
    return handleCatchApi(error)
  }
}
