# TubeClip Markdown PDF

TubeClip 向けの Markdown to PDF レンダリング基盤です。

この repo は、もともとの `vscode-markdown-pdf` フォークをベースにしつつ、現在は **Docker 常駐 API + VS Code 拡張クライアント** という形で運用する前提に寄せています。

現時点では `v1.0.0` 相当の初期完成版として、以下を扱えます。

- Docker 常駐 API 経由の PDF 生成
- VS Code 拡張からの API 経由 export
- `header.pageNumber`
- `footer.logo`
- Markdown 内画像の API 向け解決
- Mermaid 描画
- 日本語フォント埋め込み

## Current Architecture

構成は大きく 2 つです。

- API サーバー
  Markdown を受けて PDF を返す
- VS Code 拡張
  Markdown と front matter を読み取り、必要な asset を解決して API に送る

現時点の正式な PDF 出力経路は 1 つです。

- VS Code コマンド: `TubeClip Markdown PDF: Export via API (pdf)`

ローカルで直接 Puppeteer を動かす旧経路は、現在の正式導線ではありません。

## Run API With Docker

現時点での基本運用は Docker ベースです。

```bash
docker compose up -d --build
```

停止:

```bash
docker compose down
```

既定ポート:

```text
http://localhost:13720
```

`docker-compose.yml` では `restart: unless-stopped` を使っているため、常駐向きの運用を想定しています。

## Local Development API

Docker ではなくローカルで直接起動したい場合は、次でも動きます。

```bash
npm run dev:api
```

または:

```bash
make api
```

ただし、普段使いの前提は Docker 常駐です。

## VS Code Extension

拡張側は API クライアントとして扱います。

現時点では、ローカル利用を前提に `http://localhost:13720/render/pdf` を参照します。

つまり、通常の使い方は以下です。

1. Docker で API を起動する
2. VS Code に拡張を入れる
3. Markdown ファイルを開く
4. `TubeClip Markdown PDF: Export via API (pdf)` を実行する

現時点では接続先を広く設定化していませんが、将来的には API 接続先を切り替えられるように拡張可能な構成です。

## VSIX Operation

VS Code 拡張は `vsix` としてパッケージし、ローカル導入する前提です。

作成:

```bash
npx @vscode/vsce package
```

出力例:

```text
tubeclip-markdown-pdf-1.5.0.vsix
```

この `vsix` は Marketplace 公開なしで利用できます。  
ローカル運用なら、例えば `~/opt` 配下のような任意の保管場所に置いて管理すれば十分です。

VS Code への導入:

- `Extensions: Install from VSIX...`

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

現時点の責務分担は明確です。

- API
  解決済み asset を受けて描画する
- VS Code 拡張
  asset を解決して API に渡す

現時点で拡張側が解決するもの:

- Markdown 内画像
- `frontMatter.footer.logo`

つまり API は、ローカル相対パスを直接見に行く前提ではありません。

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
- API 接続先の設定化

これらは、具体的な運用課題が出た時点で次バージョンとして対応します。

## Development Policy

現時点の `v1.0.0` 方針:

- まず使える状態を優先する
- Docker 常駐 API を基本運用とする
- VS Code 拡張はローカルクライアントとして扱う
- 将来的には接続先や運用範囲を広げられるようにしていく
- 不要コード整理は後続バージョンでまとめて行う
