// URL에서 여행기 본문 텍스트를 가져옵니다. (서버에서만 실행)
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const MAX_CHARS = 30000; // LLM에 보낼 최대 글자 수
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

// 내부망 주소로 요청을 보내지 못하게 막는 최소한의 안전장치
function assertPublicUrl(u) {
  if (!["http:", "https:"].includes(u.protocol)) {
    throw new Error("http 또는 https 주소만 가져올 수 있어요.");
  }
  const h = u.hostname;
  if (
    h === "localhost" ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === "0.0.0.0" ||
    h.endsWith(".local")
  ) {
    throw new Error("이 주소는 가져올 수 없어요.");
  }
}

// 네이버 블로그 주소 → 실제 본문이 들어 있는 PostView 주소
function toNaverPostViewUrl(u) {
  if (!/(^|\.)blog\.naver\.com$/.test(u.hostname)) return null;

  let blogId = u.searchParams.get("blogId");
  let logNo = u.searchParams.get("logNo");

  if (!blogId || !logNo) {
    // blog.naver.com/{blogId}/{logNo} 형태
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
      [blogId, logNo] = parts;
    }
  }
  if (!blogId || !logNo) return null;
  return `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
}

function clean(text) {
  return text
    .replace(/\u200b/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

async function getHtml(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) throw new Error(`페이지를 불러오지 못했어요. (HTTP ${res.status})`);
  return res.text();
}

async function fetchNaverBlog(postViewUrl) {
  const html = await getHtml(postViewUrl);
  const $ = cheerio.load(html);
  // 스마트에디터 ONE → 구버전 에디터 순서로 시도
  const selectors = [".se-main-container", "#postViewArea", ".post-view", ".se_component_wrap"];
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      // 문단 경계를 줄바꿈으로 살려두면 LLM이 일정을 더 잘 읽어요.
      el.find("p, br, div.se-module-text").each((_, node) => {
        $(node).append("\n");
      });
      const text = clean(el.text());
      if (text.length > 50) return text;
    }
  }
  return "";
}

async function fetchGeneric(url) {
  const html = await getHtml(url);
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (article?.textContent) return clean(article.textContent);
  return clean(dom.window.document.body?.textContent || "");
}

export async function fetchContent(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    throw new Error("올바른 주소 형식이 아니에요.");
  }
  assertPublicUrl(u);

  const naverUrl = toNaverPostViewUrl(u);
  const text = naverUrl ? await fetchNaverBlog(naverUrl) : await fetchGeneric(u.toString());
  return text.slice(0, MAX_CHARS);
}
