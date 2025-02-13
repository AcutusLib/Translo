"use client"

import React, { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"

import i18n from "@/lib/i18n"
import { withI18n } from "@/lib/i18n/with-i18n"

export default withI18n(function ErrorPage({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    // Log the error to Sentry
    Sentry.captureException(error)
  }, [error])

  return (
    <div>
      <h2>{i18n.t("Something went wrong")}</h2>
    </div>
  )
})
