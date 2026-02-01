#!/bin/bash
# monterey-fix/install.sh
# 自动化补丁注入脚本，用于 GitHub Actions CI 环境

set -e

FIX_DIR=$(dirname "$(readlink -f "$0")")
BLINKO_ROOT=$(pwd)

echo "🔧 Starting Monterey Compatibility Injection..."

# 1. 复制必备文件
mkdir -p "$BLINKO_ROOT/patches"
cp "$FIX_DIR/vite-plugin-regex-compat.ts" "$BLINKO_ROOT/app/"
cp "$FIX_DIR/apply-patches.cjs" "$BLINKO_ROOT/patches/"
cp "$FIX_DIR/polyfill.ts" "$BLINKO_ROOT/app/src/"

# 2. 应用源码 Patch (main.tsx, Layout, globals.css)
echo "   Applying source patches..."
git apply --ignore-whitespace "$FIX_DIR/patches/source-fixes.patch" || { 
    echo "   ⚠️ git apply failed, trying with patch command..."
    patch -p1 < "$FIX_DIR/patches/source-fixes.patch"
}

# 3. 修改 package.json 添加 postinstall
echo "   Injecting postinstall script..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' 's/"postinstall": "turbo run prisma:generate --filter=@blinko\/backend"/"postinstall": "node patches\/apply-patches.cjs \&\& turbo run prisma:generate --filter=@blinko\/backend"/g' package.json
else
    sed -i 's/"postinstall": "turbo run prisma:generate --filter=@blinko\/backend"/"postinstall": "node patches\/apply-patches.cjs \&\& turbo run prisma:generate --filter=@blinko\/backend"/g' package.json
fi

# 4. 修改 vite.config.ts 添加插件配置
echo "   Configuring Vite plugin..."
# 注入导入语句
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/import { VitePWA } from 'vite-plugin-pwa'/import { VitePWA } from 'vite-plugin-pwa'\nimport { regexCompatPlugin } from '.\/vite-plugin-regex-compat'/g" app/vite.config.ts
    # 注入插件调用
    sed -i '' "s/plugins: \[/plugins: \[\n    regexCompatPlugin(),/g" app/vite.config.ts
    # 修改构建目标
    sed -i '' 's/target: "esnext"/target: ["es2020", "safari15"]/g' app/vite.config.ts
else
    sed -i "s/import { VitePWA } from 'vite-plugin-pwa'/import { VitePWA } from 'vite-plugin-pwa'\nimport { regexCompatPlugin } from '.\/vite-plugin-regex-compat'/g" app/vite.config.ts
    sed -i "s/plugins: \[/plugins: \[\n    regexCompatPlugin(),/g" app/vite.config.ts
    sed -i 's/target: "esnext"/target: ["es2020", "safari15"]/g' app/vite.config.ts
fi

echo "✅ Injection complete!"
