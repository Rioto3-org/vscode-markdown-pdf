# TubeClip Markdown PDF

TubeClip 向けの Markdown to PDF レンダリング基盤です。  
この repo は、ローカル API と VS Code 拡張を同居させた構成で、Markdown 文書を API 経由で PDF に変換します。

現時点では `v1.0.0` 相当の初期完成版として、以下を扱えます。

- VS Code からの API 経由 PDF export
- ローカル API 経由の PDF 生成
- `header.pageNumber`
- `footer.logo`
- Markdown 内画像の API 向け解決
- Mermaid 描画
- 日本語フォントの埋め込み

## Current Scope

この repo は、従来の `vscode-markdown-pdf` フォークをベースにしつつ、TubeClip 用の API 中心構成へ移行したものです。

現時点での正式な PDF 出力経路は 1 つです。

- VS Code コマンド: `Markdown PDF: Export via API (pdf)`

旧来のローカル Puppeteer ベース export 導線は、現時点では採用していません。

## Run API

ローカル API を起動します。

```bash
npm run dev:api
```

起動後の待受先:

```text
http://127.0.0.1:3000
```

## Use From VS Code

1. この repo を VS Code で開く
2. `F5` で Extension Development Host を起動する
3. Markdown ファイルを開く
4. `Markdown PDF: Export via API (pdf)` を実行する

このコマンドは、Markdown 本文と front matter を読み取り、必要な asset を解決した上でローカル API に送信します。

## API

### `POST /render/pdf`

Markdown を PDF に変換して返します。

リクエスト例:

```json
{
  "markdown": "# Hello",
  "frontMatter": {
    "header": {
      "pageNumber": true
    },
    "footer": {
      "logo": "data:image/png;base64,..."
    }
  }
}
```

レスポンス:

- `200 OK`
- `Content-Type: application/pdf`

### curl example

```bash
LOGO_DATA_URL="$(python3 - <<'PY'
import base64, mimetypes
path = './Tubeclip-Banner.png'
mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
with open(path, 'rb') as f:
    print(f'data:{mime};base64,' + base64.b64encode(f.read()).decode())
PY
)"

jq -n \
  --rawfile markdown ./1.purchase-start.md \
  --arg logo "$LOGO_DATA_URL" \
  '{
    markdown: $markdown,
    frontMatter: {
      header: {
        pageNumber: true
      },
      footer: {
        logo: $logo
      }
    }
  }' \
| curl -X POST http://localhost:3000/render/pdf \
    -H 'content-type: application/json' \
    -d @- \
    --output ./1.purchase-start.pdf
```

## Front Matter

現時点で正式に扱う front matter は 2 つです。

```yaml
---
header:
  pageNumber: true
footer:
  logo: data:image/png;base64,...
---
```

### `header.pageNumber`

`true` のとき、右上ヘッダにページ番号を出します。

### `footer.logo`

フッタ中央にロゴを出します。  
この値は、解決済みの `data:` URL または `http(s)` URL を前提にします。

## Asset Resolution

リモート API 前提の責務分担として、asset 解決はクライアント側で行います。

現時点では VS Code 拡張が次を解決します。

- Markdown 内画像
- `frontMatter.footer.logo`

つまり API は、解決済みデータを受けて描画するだけです。

## Mermaid

Mermaid は API レンダリング時に SVG として描画されます。

対応例:

- `flowchart`
- `gantt`

現時点では「描画」までは対応済みですが、Mermaid 図に対する自動改ページ最適化は未対応です。

## Fonts

現在の PDF 出力では、以下の方針を採用しています。

- 全体: `Noto Serif JP`

フォントファイルは repo 内に同梱し、API 側で埋め込んでいます。

## Known Gaps

現時点で後続課題として扱うもの:

- Mermaid 図の自動改ページ最適化
- 大きい画像の自動改ページ最適化
- 旧コードの削除リファクタリング

これらは、具体的な運用課題が出た時点で次バージョンとして対応します。

## Development Note

現時点の `v1.0.0` 方針:

- まず使える状態を優先する
- API と VS Code クライアントを同一 repo で進める
- 不要コード整理は後続バージョンでまとめて行う
