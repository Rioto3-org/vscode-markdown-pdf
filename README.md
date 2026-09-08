# TubeClip Markdown PDF

TubeClip 向けの Markdown to PDF レンダリング基盤です。

この repo は、もともとの `vscode-markdown-pdf` フォークをベースにしつつ、現在は **ホスト型コールドスタート API + VS Code 拡張クライアント** という形で運用する前提に寄せています。

このAPIは単一Mac上での低頻度利用を前提にしているため、常駐プロセスは持ちません。VS Code 拡張が Export 実行時に自分でAPIの起動を保証し、使い終わった後はAPI側が自動で終了します。

現時点では以下を扱えます。

- コールドスタートAPI経由のPDF生成（拡張が未起動時に自動起動）
- VS Code 拡張からの API 経由 export
- `header.pageNumber`
- `footer.logo`
- Markdown 内画像の API 向け解決
- Mermaid 描画
- 日本語フォント埋め込み

## Current Architecture

構成は大きく 2 つです。

- API サーバー
  Markdown を受けて PDF を返す。常駐せず、リクエストがない状態が一定時間続くと自動終了する
- VS Code 拡張
  Markdown と front matter を読み取り、必要な asset を解決して API に送る。API が未起動なら自分で起動する

現時点の正式な PDF 出力経路は 1 つです。

- VS Code コマンド: `TubeClip Markdown PDF: Export via API (pdf)`

ローカルで直接 Puppeteer を動かす旧経路は、現在の正式導線ではありません。

## Run API (Host, Cold Start)

基本運用は Docker を使わないホスト直接起動です。VS Code 拡張から `Export via API` を実行すると、APIが未起動であれば拡張が自動的に起動します。**手動でAPIを起動する必要はありません。**

手動で起動・確認したい場合は次でも動きます。

```bash
npm run dev:api
```

または:

```bash
make api
```

既定ポート:

```text
http://localhost:13720
```

ヘルスチェック:

```bash
curl http://localhost:13720/health
```

### Idle Timeout

APIは既定で **10分間リクエストがないと自動終了**します（`IDLE_TIMEOUT_MS` 環境変数で変更可能、`0`で無効化）。常駐させたくない・低頻度利用という運用方針に合わせた挙動です。

```bash
IDLE_TIMEOUT_MS=1800000 npm run dev:api  # 30分に延長する例
```

### Chromium (Puppeteer) の準備

`puppeteer-core` を使用しているため、Chromium が同梱されていません。ホスト側に別途ブラウザが必要です。

優先順位は次の通りです（[src/core/render.js](src/core/render.js) の `getExecutablePath`）。

1. `PUPPETEER_EXECUTABLE_PATH` または `CHROME_BIN` 環境変数
2. macOSの既定インストール先 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
3. `puppeteer-core` のフォールバック（通常は見つからない）

**通常のMacに Google Chrome を普通にインストールしていれば、追加設定なしでそのまま動きます。** 別のブラウザ（Chromium単体など）を使いたい場合のみ、環境変数で明示的にパスを指定してください。

```bash
export PUPPETEER_EXECUTABLE_PATH="/Applications/Chromium.app/Contents/MacOS/Chromium"
```

## VS Code Extension

拡張側は API クライアントであると同時に、APIの起動保証も担います。

`Export via API` 実行時の内部フロー:

1. `GET /health` でAPIの生存確認
2. 応答がなければ拡張自身が `node src/server/index.js` を子プロセスとして起動し、起動完了まで最大20秒ポーリング
3. Markdown と front matter を解決して API にレンダリングリクエストを送る

つまり、通常の使い方は以下です。

1. VS Code に拡張を入れる（Chromeがホストにインストール済みであること）
2. Markdown ファイルを開く
3. `TubeClip Markdown PDF: Export via API (pdf)` を実行する（APIは自動起動される）

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

現時点の `v1.6.0` 方針:

- まず使える状態を優先する
- ホスト型コールドスタートAPIを基本運用とする（常駐プロセスを持たない）
- VS Code 拡張はAPIクライアントであると同時に、起動保証も担う
- 将来的には接続先や運用範囲を広げられるようにしていく
- 不要コード整理は後続バージョンでまとめて行う
