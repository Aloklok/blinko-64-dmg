/**
 * vite-plugin-regex-compat.ts
 * 
 * Vite 插件：将 ES2018 正则表达式转换为 Safari 15 WKWebView 兼容版本
 * 
 * 处理以下问题：
 * 1. 具名分组 (?<name>...) -> 转换为普通分组 (...)
 * 2. 具名反向引用 \k<name> -> 转换为普通反向引用 \1, \2...
 * 3. Lookbehind (?<=...) 和 (?<!...) -> 简化处理（移除或替换）
 * 
 * 注意：Lookbehind 的移除可能影响正则匹配精度，但比完全不工作要好
 */

import type { Plugin } from 'vite';

/**
 * 处理正则字面量中的具名分组
 */
function transformRegexLiterals(code: string): string {
    // 匹配正则表达式字面量 /pattern/flags
    const regexLiteralPattern = /(?<![)\]\w$])\/(?![*\/])(?:[^\\/\r\n\[]|\\.|\[(?:[^\]\\\r\n]|\\.)*\])+\/[gimsuy]*/g;

    return code.replace(regexLiteralPattern, (match) => {
        if (!/\(\?<[a-zA-Z_][a-zA-Z0-9_]*>/.test(match)) {
            return match;
        }

        const groupNames: string[] = [];
        const namedGroupPattern = /\(\?<([a-zA-Z_][a-zA-Z0-9_]*)>/g;
        let groupMatch;
        while ((groupMatch = namedGroupPattern.exec(match)) !== null) {
            if (!groupNames.includes(groupMatch[1])) {
                groupNames.push(groupMatch[1]);
            }
        }

        let result = match.replace(/\(\?<[a-zA-Z_][a-zA-Z0-9_]*>/g, '(');

        for (let i = 0; i < groupNames.length; i++) {
            const backrefPattern = new RegExp(`\\\\k<${groupNames[i]}>`, 'g');
            result = result.replace(backrefPattern, `\\${i + 1}`);
        }

        return result;
    });
}

/**
 * 处理 new RegExp() 构造函数中的 Lookbehind 和具名分组
 * 这是关键函数 - 需要处理字符串中的正则模式
 */
function transformRegExpConstructor(code: string): string {
    // 匹配 new RegExp(...) 构造函数调用
    // 使用更宽松的匹配来捕获复杂的参数
    const regExpPattern = /new\s+RegExp\s*\(\s*([`"'])([^]*?)\1/g;

    return code.replace(regExpPattern, (match, quote, pattern) => {
        let modified = false;
        let newPattern = pattern;

        // 处理 Lookbehind: (?<=...) 和 (?<!...)
        // 在 RegExp 字符串中，lookbehind 看起来像 (?<= 或 (?<!
        // 但因为是字符串，可能有额外的转义

        // 处理 (?<!...) - 负向 lookbehind
        // 在字符串中可能表示为 (?<! 或 (?\<! 等
        if (newPattern.includes('(?<!') || newPattern.includes('(?<=')) {
            // 简单策略：将 lookbehind 断言替换为非捕获组或空
            // (?<!X)Y 大致等于 Y（失去了"前面不是X"的约束，但至少不会报错）
            // (?<=X)Y 大致等于 Y（失去了"前面是X"的约束）

            // 用一个递归函数来安全地移除 lookbehind
            newPattern = removeLookbehindFromPattern(newPattern);
            modified = true;
        }

        // 处理具名分组
        if (/\(\?<[a-zA-Z_][a-zA-Z0-9_]*>/.test(newPattern)) {
            const groupNames: string[] = [];
            const namedGroupPattern = /\(\?<([a-zA-Z_][a-zA-Z0-9_]*)>/g;
            let groupMatch;
            while ((groupMatch = namedGroupPattern.exec(newPattern)) !== null) {
                if (!groupNames.includes(groupMatch[1])) {
                    groupNames.push(groupMatch[1]);
                }
            }

            newPattern = newPattern.replace(/\(\?<[a-zA-Z_][a-zA-Z0-9_]*>/g, '(');

            // 处理反向引用（在字符串中可能是 \\k<name>）
            for (let i = 0; i < groupNames.length; i++) {
                const backrefPatterns = [
                    new RegExp(`\\\\\\\\k<${groupNames[i]}>`, 'g'),  // \\k<name> in string
                    new RegExp(`\\\\k<${groupNames[i]}>`, 'g'),      // \k<name> in string
                ];
                backrefPatterns.forEach(p => {
                    const replacement = newPattern.includes('\\\\') ? `\\\\${i + 1}` : `\\${i + 1}`;
                    newPattern = newPattern.replace(p, replacement);
                });
            }
            modified = true;
        }

        if (modified) {
            return `new RegExp(${quote}${newPattern}${quote}`;
        }
        return match;
    });
}

/**
 * 从正则模式字符串中移除 lookbehind 断言
 * 这是一个简化处理，会丢失 lookbehind 的语义，但能让正则工作
 */
function removeLookbehindFromPattern(pattern: string): string {
    let result = pattern;

    // 处理 (?<!...) - 需要找到匹配的括号
    while (result.includes('(?<!') || result.includes('(?<=')) {
        // 找到 lookbehind 的位置
        let pos = result.indexOf('(?<!');
        let isNegative = true;
        if (pos === -1) {
            pos = result.indexOf('(?<=');
            isNegative = false;
        }
        if (pos === -1) break;

        // 找到匹配的右括号
        let depth = 1;
        let i = pos + 4; // 跳过 (?<! 或 (?<=
        while (i < result.length && depth > 0) {
            if (result[i] === '\\' && i + 1 < result.length) {
                i += 2; // 跳过转义字符
                continue;
            }
            if (result[i] === '(') depth++;
            else if (result[i] === ')') depth--;
            i++;
        }

        if (depth === 0) {
            // 移除整个 lookbehind 断言（包括括号内的内容）
            result = result.slice(0, pos) + result.slice(i);
        } else {
            // 无法找到匹配的括号，简单替换
            result = result.replace('(?<!', '(?:').replace('(?<=', '(?:');
            break;
        }
    }

    return result;
}

export function regexCompatPlugin(): Plugin {
    return {
        name: 'vite-plugin-regex-compat',
        apply: 'build',

        renderChunk(code, chunk) {
            const hasNamedGroups = /\(\?<[a-zA-Z_][a-zA-Z0-9_]*>/.test(code);
            const hasLookbehind = /\(\?<[=!]/.test(code);

            if (!hasNamedGroups && !hasLookbehind) {
                return null;
            }

            console.log(`[regex-compat] Processing chunk: ${chunk.fileName}`);

            let result = code;

            // 处理正则字面量中的具名分组
            if (hasNamedGroups) {
                result = transformRegexLiterals(result);
            }

            // 处理 RegExp 构造函数中的 lookbehind 和具名分组
            result = transformRegExpConstructor(result);

            // 验证处理结果
            const remainingNamedGroups = (result.match(/\(\?<[a-zA-Z_][a-zA-Z0-9_]*>/g) || []).length;
            const remainingLookbehind = (result.match(/\(\?<[=!]/g) || []).length;

            if (remainingNamedGroups > 0) {
                console.log(`[regex-compat] Warning: ${remainingNamedGroups} named groups remaining in ${chunk.fileName}`);
            }
            if (remainingLookbehind > 0) {
                console.log(`[regex-compat] Warning: ${remainingLookbehind} lookbehinds remaining in ${chunk.fileName}`);
            }

            return {
                code: result,
                map: null,
            };
        }
    };
}

export default regexCompatPlugin;
