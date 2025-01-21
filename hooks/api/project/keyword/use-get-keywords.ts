import { useMemo } from "react"
import { ProjectLanguage } from "@prisma/client"
import { JsonValue } from "@prisma/client/runtime/library"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"

import { KeywordData, LanguageData } from "@/components/app/project/types"

export type LanguageProps = Pick<ProjectLanguage, "short" | "name">

type GetKeywordsResponseType = {
  keyword: string
  id: string
  projectId: string
  context: string
  rephrase: boolean
  translations: {
    id: string
    keywordId: string
    projectLanguageId: string
    value: string
    history: JsonValue | null
  }[]
}[]

const getKeywords = async (
  projectId: string
): Promise<GetKeywordsResponseType> => {
  const result = await axios({
    url: `/api/projects/${projectId}/keywords`,
    method: "GET",
  })

  return result.data
}

type GetKeywordsApi = {
  projectId: string
  defaultLanguage: string
  initialData: {
    keywords: KeywordData[]
    languages: LanguageData[]
  }
}

export const getKeywordsQueryKey = (projectId: string) => [
  "getKeywords",
  projectId,
]

export const useGetKeywords = ({
  projectId,
  initialData,
  defaultLanguage,
}: GetKeywordsApi) => {
  const result = useQuery<GetKeywordsResponseType>({
    queryKey: getKeywordsQueryKey(projectId),
    queryFn: async () => await getKeywords(projectId),
  })

  const keywordsFromApi = result.data
  const languagesFromApi = initialData.languages

  const keywordsFromApiWithTranslation = useMemo((): KeywordData[] => {
    if (!keywordsFromApi) {
      return initialData.keywords
    }
    return keywordsFromApi.map((keyword): KeywordData => {
      const translations = keyword.translations
        .filter((translation) =>
          languagesFromApi.find(
            (lang) => lang.id === translation.projectLanguageId
          )
        )
        .map((translation) => {
          const language = languagesFromApi.find(
            (lang) => lang.id === translation.projectLanguageId
          )

          if (!language) {
            throw new Error(
              `Language not found for projectLanguageId: ${translation.projectLanguageId}`
            )
          }

          return {
            ...translation,
            language,
          }
        })

      return {
        ...keyword,
        translations,
        defaultTranslation:
          translations.find(
            (translation) => translation.language?.short === defaultLanguage
          )?.value ||
          translations.find(
            (translation) => translation.language?.short === "en"
          )?.value ||
          translations[0]?.value ||
          "",
      }
    })
  }, [defaultLanguage, initialData.keywords, keywordsFromApi, languagesFromApi])

  return keywordsFromApiWithTranslation
}
