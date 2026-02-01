#!/usr/bin/env node
/**
 * apply-patches.cjs
 * 
 * 手动补丁脚本 - 用于在 bun install 后自动应用必要的兼容性补丁
 * 目的：修复 macOS Monterey (Safari 15 WebKit) 的正则表达式兼容性问题
 * 
 * 处理的问题：
 * 1. Lookbehind 断言 (?<=...) 和 (?<!...) — Safari 15 不支持
 * 2. 具名分组 (?<name>...) — Safari 15 不支持
 * 3. 具名反向引用 \k<name> — Safari 15 不支持
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Applying Monterey (Safari 15 WebKit) compatibility patches...');

let patchedCount = 0;

// ============================================================
// Patch 1: mdast-util-gfm-autolink-literal
// ============================================================
const mdastFile = path.join(process.cwd(), 'node_modules/mdast-util-gfm-autolink-literal/lib/index.js');
if (fs.existsSync(mdastFile)) {
    let content = fs.readFileSync(mdastFile, 'utf8');

    // 原始正则：(?<=^|\s|\p{P}|\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)
    const emailRegexOld = '(?<=^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)';
    const emailRegexNew = '([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)';

    if (content.includes(emailRegexOld)) {
        content = content.replace(emailRegexOld, emailRegexNew);
        content = content.replace(/\/gu,\s*findEmail/g, '/g, findEmail');
        fs.writeFileSync(mdastFile, content, 'utf8');
        console.log('   ✅ mdast-util-gfm-autolink-literal: patched (removed lookbehind)');
        patchedCount++;
    } else if (content.includes('?<=') || content.includes('?<!')) {
        console.log('   ⚠️  mdast-util-gfm-autolink-literal: lookbehind found but pattern not matched');
    } else {
        console.log('   ✅ mdast-util-gfm-autolink-literal: already compatible');
    }
} else {
    console.log('   ⏭️  mdast-util-gfm-autolink-literal: not found, skipping');
}

// ============================================================
// Patch 2: marked (blockSkip regex)
// ============================================================
const markedFiles = [
    'node_modules/marked/lib/marked.esm.js',
    'node_modules/marked/lib/marked.umd.js',
];

for (const markedFile of markedFiles) {
    const filePath = path.join(process.cwd(), markedFile);
    if (!fs.existsSync(filePath)) {
        continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // 原始正则 (link): (?<!`)(?<a>`+)[^`]+\k<a>(?!`)
    // 问题：1) (?<!`) lookbehind  2) (?<a>...) 具名分组  3) \k<a> 具名反向引用
    // 修复：移除 lookbehind，将具名分组改为普通分组，将 \k<a> 改为 \1
    // 注意：这会改变匹配行为，但能让代码运行

    // 原始正则在代码中的表示：
    // /\[(?:[^\[\]`]|(?<!`)(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\()\)]|\((?:\\[\s\S]|[^\\()\)])*\))*\)/
    // 转换为：/\[(?:[^\[\]`]|(`+)[^`]+\1(?!`))*?\]\((?:\\[\s\S]|[^\\()\)]|\((?:\\[\s\S]|[^\\()\)])*\))*\)/

    // Pattern for link regex
    const linkPatternOld = /\(\?\<\!\`\)\(\?\<a\>\`\+\)\[\^\`\]\+\\k\<a\>\(\?\!\`\)/g;
    const linkPatternNew = '(`+)[^`]+\\1(?!`)';

    if (linkPatternOld.test(content)) {
        content = content.replace(linkPatternOld, linkPatternNew);
        modified = true;
    }

    // Simpler approach: just replace the exact strings
    // Link regex: (?<!`)(?<a>`+)[^`]+\k<a>(?!`)
    const link1 = '(?<!`)(?<a>`+)[^`]+\\k<a>(?!`)';
    const link1Fixed = '(`+)[^`]+\\1(?!`)';

    if (content.includes(link1)) {
        content = content.replace(link1, link1Fixed);
        modified = true;
    }

    // Code regex: (?<!`)(?<b>`+)[^`]+\k<b>(?!`)
    const code1 = '(?<!`)(?<b>`+)[^`]+\\k<b>(?!`)';
    const code1Fixed = '(`+)[^`]+\\1(?!`)';

    if (content.includes(code1)) {
        content = content.replace(code1, code1Fixed);
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`   ✅ ${path.basename(markedFile)}: patched (removed lookbehind + named groups)`);
        patchedCount++;
    } else if (content.includes('?<!') || content.includes('?<=')) {
        console.log(`   ⚠️  ${path.basename(markedFile)}: lookbehind found but pattern not matched`);
    } else {
        console.log(`   ✅ ${path.basename(markedFile)}: already compatible`);
    }
}

// ============================================================
// Patch 3: vditor highlight.js
// 注意：此 patch 已禁用，因为简单移除 lookbehind 会破坏语法高亮逻辑
// vditor 的 lookbehind 错误只是控制台警告，不会阻塞应用运行
// ============================================================
// const vditorHighlightFile = path.join(process.cwd(), 'node_modules/vditor/dist/js/highlight.js/third-languages.js');
// ... (disabled)
console.log('   ⏭️  vditor/highlight.js: patch skipped (too risky)');

console.log(`🎉 Patching complete! ${patchedCount} file(s) modified.`);

