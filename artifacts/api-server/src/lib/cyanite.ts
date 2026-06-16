/**
 * Cyanite audio analysis client.
 * Uses OAuth2 client credentials + GraphQL API.
 * Analyzes uploaded audio for genre, mood, and energy.
 *
 * API docs: https://cyanite.ai/developers
 * Token:    POST https://id.cyanite.ai/oauth/token
 * GraphQL:  POST https://api.cyanite.ai/graphql
 */

import { readFile } from "fs/promises";

const TOKEN_URL = "https://id.cyanite.ai/oauth/token";
const GRAPHQL_URL = "https://api.cyanite.ai/graphql";
const MAX_POLL_MS = 3 * 60_000;
const POLL_INTERVAL_MS = 4_000;

export interface CyaniteResult {
  genre?: string;
  moods?: string[];
  energy?: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const clientId = process.env.CYANITE_CLIENT_ID;
  const clientSecret = process.env.CYANITE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("CYANITE_CLIENT_ID or CYANITE_CLIENT_SECRET is not set");

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.status.toString());
    throw new Error(`Cyanite OAuth failed: HTTP ${resp.status} — ${text.slice(0, 200)}`);
  }
  const data = await resp.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Cyanite OAuth: no access_token in response");

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  const resp = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`Cyanite GraphQL HTTP ${resp.status}`);
  const body = await resp.json() as { data?: T; errors?: unknown[] };
  if (body.errors?.length) {
    throw new Error(`Cyanite GraphQL errors: ${JSON.stringify(body.errors).slice(0, 300)}`);
  }
  if (!body.data) throw new Error("Cyanite GraphQL: no data in response");
  return body.data;
}

const FILE_UPLOAD_REQUEST_MUTATION = `
  mutation FileUploadRequest {
    fileUploadRequest {
      id
      uploadUrl
    }
  }
`;

const LIBRARY_TRACK_CREATE_MUTATION = `
  mutation LibraryTrackCreate($uploadId: ID!) {
    libraryTrackCreate(input: { uploadId: $uploadId }) {
      ... on LibraryTrackCreateSuccess {
        track {
          id
        }
      }
      ... on LibraryTrackCreateError {
        code
        message
      }
    }
  }
`;

const TRACK_ANALYSIS_QUERY = `
  query TrackAnalysis($id: ID!) {
    libraryTrack(id: $id) {
      id
      audioAnalysisV6 {
        ... on AudioAnalysisV6Finished {
          result {
            genreTags {
              weight
              label
            }
            moodTags {
              weight
              label
            }
            energyLevel {
              value
            }
          }
        }
        ... on AudioAnalysisV6Processing {
          __typename
        }
        ... on AudioAnalysisV6Failed {
          error {
            message
          }
        }
      }
    }
  }
`;

/**
 * Upload and analyze an audio file with Cyanite.
 * Returns genre, mood tags, and energy level.
 */
export async function analyzeAudio(audioPath: string): Promise<CyaniteResult> {
  const token = await getAccessToken();

  const uploadData = await gql<{ fileUploadRequest: { id: string; uploadUrl: string } }>(
    FILE_UPLOAD_REQUEST_MUTATION,
    {},
  );
  const { id: uploadId, uploadUrl } = uploadData.fileUploadRequest;

  const buf = await readFile(audioPath);
  const putResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "audio/wav" },
    body: buf,
    signal: AbortSignal.timeout(120_000),
  });
  if (!putResp.ok) throw new Error(`Cyanite S3 upload failed: HTTP ${putResp.status}`);

  const createData = await gql<{
    libraryTrackCreate: {
      track?: { id: string };
      code?: string;
      message?: string;
    };
  }>(LIBRARY_TRACK_CREATE_MUTATION, { uploadId });

  const trackId = createData.libraryTrackCreate.track?.id;
  if (!trackId) {
    throw new Error(
      `Cyanite track create failed: ${createData.libraryTrackCreate.message ?? "unknown"}`,
    );
  }

  const deadline = Date.now() + MAX_POLL_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const analysisData = await gql<{
      libraryTrack: {
        id: string;
        audioAnalysisV6: {
          __typename?: string;
          result?: {
            genreTags: Array<{ weight: number; label: string }>;
            moodTags: Array<{ weight: number; label: string }>;
            energyLevel?: { value: string };
          };
          error?: { message: string };
        } | null;
      };
    }>(TRACK_ANALYSIS_QUERY, { id: trackId });

    const analysis = analysisData.libraryTrack?.audioAnalysisV6;
    if (!analysis) continue;

    if (analysis.error) throw new Error(`Cyanite analysis failed: ${analysis.error.message}`);
    if (!analysis.result) continue;

    const { genreTags, moodTags, energyLevel } = analysis.result;

    const topGenre = genreTags
      .sort((a, b) => b.weight - a.weight)
      .find(g => g.weight > 0.2);

    const topMoods = moodTags
      .sort((a, b) => b.weight - a.weight)
      .filter(m => m.weight > 0.15)
      .slice(0, 4)
      .map(m => m.label);

    return {
      genre: topGenre?.label,
      moods: topMoods.length > 0 ? topMoods : undefined,
      energy: energyLevel?.value,
    };
  }

  throw new Error("Cyanite timeout: analysis did not complete in time");
}

export function isConfigured(): boolean {
  return Boolean(process.env.CYANITE_CLIENT_ID && process.env.CYANITE_CLIENT_SECRET);
}
