#!/bin/bash

echo "=========================================="
echo "Expo開発サーバー + 地震監視サービス起動"
echo "=========================================="
echo ""

# プロジェクトディレクトリに移動（スクリプト配置場所を基準にする）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || {
    echo "❌ エラー: プロジェクトディレクトリへ移動できません: $SCRIPT_DIR"
    exit 1
}

# .envファイルの存在確認と読み込み
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ エラー: .env ファイルが見つかりません"
    exit 1
fi

# Node.jsバージョンを確認・切り替え
echo "Node.jsバージョンを確認中..."
if command -v nvm &> /dev/null; then
    # .nvmrcが存在する場合は自動的に読み込み
    if [ -f .nvmrc ]; then
        nvm use
    else
        nvm use 20 2>/dev/null || nvm use default
    fi
fi

echo "現在のNode.js: $(node --version)"
echo ""

# Node.js v24 の場合は警告
if [[ $(node --version) == v24* ]]; then
    echo "⚠️  警告: Node.js v24が検出されました"
    echo "⚠️  v20に切り替えてください: nvm use 20"
    echo ""
    read -p "続行しますか？ (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 既存のプロセスを停止
echo "既存のプロセスをチェック中..."
if lsof -ti:8081 &> /dev/null; then
    echo "ポート8081を使用中のプロセスを停止..."
    lsof -ti:8081 | xargs kill -9 2>/dev/null
fi

if lsof -ti:19000 &> /dev/null; then
    echo "ポート19000を使用中のプロセスを停止..."
    lsof -ti:19000 | xargs kill -9 2>/dev/null
fi

echo ""
echo "✅ 開発サーバーを起動中..."
echo "✅ 地震監視サービスを起動中..."
echo ""
echo "📝 ログの見方:"
echo "   [0] = Webサーバー"
echo "   [1] = 地震監視サービス"
echo "=========================================="
echo ""

# Webサーバーと地震監視サービスを同時起動
npm run web
