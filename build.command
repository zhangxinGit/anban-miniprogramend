#!/bin/bash
cd "$(dirname "$0")"

echo "🔍 第一步：检查 TypeScript 类型错误..."
./node_modules/.bin/tsc --project tsconfig.json --noEmit 2>&1
echo ""
echo "==========================================="
echo "📦 第二步：生成 JS 文件..."
./node_modules/.bin/tsc --project tsconfig.json 2>&1
echo ""
echo "==========================================="
if [ $? -eq 0 ]; then
    echo "✅ 编译完成！请回到微信开发者工具点击【编译】"
else
    echo "❌ 编译过程中有错误，请查看上面的输出"
fi
read -p "按回车键关闭..."
