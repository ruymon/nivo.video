import { db } from '@nivo/drizzle'
import { upload } from '@nivo/drizzle/schema'
import { env } from '@nivo/env'
import axios from 'axios'
import { BunnyCdnStream } from 'bunnycdn-stream'
import { eq } from 'drizzle-orm'

import { WebhookError } from '../errors/webhook-error'

export async function uploadToExternalProvider(videoId: string) {
  const sourceVideo = await db.query.upload.findFirst({
    where(fields, { eq }) {
      return eq(fields.id, videoId)
    },
    with: {
      company: {
        columns: {
          externalId: true,
        },
      },
    },
  })

  if (!sourceVideo) {
    throw new WebhookError('Video not found.')
  }

  if (!sourceVideo.processedAt || !sourceVideo.storageKey) {
    throw new WebhookError("Video hasn't processed yet.")
  }

  if (!sourceVideo.company.externalId) {
    throw new WebhookError('Company has no external ID.')
  }

  if (sourceVideo.externalProviderId) {
    /**
     * Video was already uploaded to external provider
     */

    return
  }

  const bunny = new BunnyCdnStream({
    apiKey: env.BUNNY_API_KEY,
    videoLibrary: sourceVideo.company.externalId,
  })

  const videoDownloadURL = `https://pub-${env.CLOUDFLARE_UPLOAD_BUCKET_ID}.r2.dev/${videoId}.mp4`

  const { data } = await axios.get(videoDownloadURL, {
    responseType: 'stream',
  })

  const { guid: externalProviderId } = await bunny.createAndUploadVideo(data, {
    title: sourceVideo.title,
  })

  await db
    .update(upload)
    .set({ externalProviderId })
    .where(eq(upload.id, videoId))
}
