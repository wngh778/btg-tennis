import '@supabase/functions-js/edge-runtime.d.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { imageBase64, mediaType } = await req.json() as {
      imageBase64: string;
      mediaType: string;
    };

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('Gemini API key not configured');

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mediaType, data: imageBase64 } },
            {
              text:
                `테니스 대진표가 적힌 칠판 사진입니다.
규칙:
- 왼쪽 열: 남자 선수 → gender: "male"
- 오른쪽 열: 여자 선수 → gender: "female"
- 각 행 형식: 선수이름 + 라운드별 코트번호 (공백으로 구분)
- 숫자(1~4): 해당 라운드 배정 코트번호
- 하이픈(-): 해당 라운드 휴식 → null

아래 JSON 형식으로만 응답해주세요 (설명 없이, JSON만):
{"players":[{"name":"이름","gender":"male","courts":[1,2,null,3,1]},{"name":"이름","gender":"female","courts":[3,null,3,2,3]}]}`,
            },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.json() as { error?: { message?: string } };
      throw new Error(err?.error?.message ?? `Gemini error ${geminiRes.status}`);
    }

    const data = await geminiRes.json() as {
      candidates: { content: { parts: { text: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

    return new Response(JSON.stringify({ text }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
