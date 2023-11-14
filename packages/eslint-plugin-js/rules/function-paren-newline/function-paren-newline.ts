/**
 * @fileoverview enforce consistent line breaks inside function parentheses
 * @author Teddy Katz
 */

import type { TSESTree } from '@typescript-eslint/utils'
import { isClosingParenToken, isFunction, isOpeningParenToken, isTokenOnSameLine } from '../../utils/ast-utils'
import { createRule } from '../../utils/createRule'
import type { Token } from '../../utils/types'

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

interface ParensPair {
  leftParen: Token
  rightParen: Token
}

export default createRule({
  meta: {
    type: 'layout',

    docs: {
      description: 'Enforce consistent line breaks inside function parentheses',
      url: 'https://eslint.style/rules/js/function-paren-newline',
    },

    fixable: 'whitespace',

    schema: [
      {
        oneOf: [
          {
            type: 'string',
            enum: ['always', 'never', 'consistent', 'multiline', 'multiline-arguments'],
          },
          {
            type: 'object',
            properties: {
              minItems: {
                type: 'integer',
                minimum: 0,
              },
            },
            additionalProperties: false,
          },
        ],
      },
    ],

    messages: {
      expectedBefore: 'Expected newline before \')\'.',
      expectedAfter: 'Expected newline after \'(\'.',
      expectedBetween: 'Expected newline between arguments/params.',
      unexpectedBefore: 'Unexpected newline before \')\'.',
      unexpectedAfter: 'Unexpected newline after \'(\'.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode
    const rawOption = context.options[0] || 'multiline'
    const multilineOption = rawOption === 'multiline'
    const multilineArgumentsOption = rawOption === 'multiline-arguments'
    const consistentOption = rawOption === 'consistent'
    let minItems: number | null = null

    if (typeof rawOption === 'object')
      minItems = rawOption.minItems
    else if (rawOption === 'always')
      minItems = 0
    else if (rawOption === 'never')
      minItems = Infinity

    // ----------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------

    /**
     * Determines whether there should be newlines inside function parens
     * @param {ASTNode[]} elements The arguments or parameters in the list
     * @param {boolean} hasLeftNewline `true` if the left paren has a newline in the current code.
     * @returns {boolean} `true` if there should be newlines inside the function parens
     */
    function shouldHaveNewlines(elements: TSESTree.CallExpressionArgument[] | TSESTree.Parameter[], hasLeftNewline: boolean) {
      if (multilineArgumentsOption && elements.length === 1)
        return hasLeftNewline

      if (multilineOption || multilineArgumentsOption)
        return elements.some((element, index) => index !== elements.length - 1 && element.loc.end.line !== elements[index + 1].loc.start.line)

      if (consistentOption)
        return hasLeftNewline

      return minItems === null || elements.length >= minItems
    }

    /**
     * Validates parens
     * @param {object} parens An object with keys `leftParen` for the left paren token, and `rightParen` for the right paren token
     * @param {ASTNode[]} elements The arguments or parameters in the list
     * @returns {void}
     */
    function validateParens(parens: ParensPair, elements: TSESTree.CallExpressionArgument[] | TSESTree.Parameter[]) {
      const leftParen = parens.leftParen
      const rightParen = parens.rightParen
      const tokenAfterLeftParen = sourceCode.getTokenAfter(leftParen)!
      const tokenBeforeRightParen = sourceCode.getTokenBefore(rightParen)!
      const hasLeftNewline = !isTokenOnSameLine(leftParen, tokenAfterLeftParen)
      const hasRightNewline = !isTokenOnSameLine(tokenBeforeRightParen, rightParen)
      const needsNewlines = shouldHaveNewlines(elements, hasLeftNewline)

      if (hasLeftNewline && !needsNewlines) {
        context.report({
          node: leftParen,
          messageId: 'unexpectedAfter',
          fix(fixer) {
            return sourceCode.getText().slice(leftParen.range[1], tokenAfterLeftParen.range[0]).trim()

            // If there is a comment between the ( and the first element, don't do a fix.
              ? null
              : fixer.removeRange([leftParen.range[1], tokenAfterLeftParen.range[0]])
          },
        })
      }
      else if (!hasLeftNewline && needsNewlines) {
        context.report({
          node: leftParen,
          messageId: 'expectedAfter',
          fix: fixer => fixer.insertTextAfter(leftParen, '\n'),
        })
      }

      if (hasRightNewline && !needsNewlines) {
        context.report({
          node: rightParen,
          messageId: 'unexpectedBefore',
          fix(fixer) {
            return sourceCode.getText().slice(tokenBeforeRightParen.range[1], rightParen.range[0]).trim()

            // If there is a comment between the last element and the ), don't do a fix.
              ? null
              : fixer.removeRange([tokenBeforeRightParen.range[1], rightParen.range[0]])
          },
        })
      }
      else if (!hasRightNewline && needsNewlines) {
        context.report({
          node: rightParen,
          messageId: 'expectedBefore',
          fix: fixer => fixer.insertTextBefore(rightParen, '\n'),
        })
      }
    }

    /**
     * Validates a list of arguments or parameters
     * @param {object} parens An object with keys `leftParen` for the left paren token, and `rightParen` for the right paren token
     * @param {ASTNode[]} elements The arguments or parameters in the list
     * @returns {void}
     */
    function validateArguments(parens: ParensPair, elements: TSESTree.CallExpressionArgument[] | TSESTree.Parameter[]) {
      const leftParen = parens.leftParen
      const tokenAfterLeftParen = sourceCode.getTokenAfter(leftParen)
      const hasLeftNewline = !isTokenOnSameLine(leftParen, tokenAfterLeftParen)
      const needsNewlines = shouldHaveNewlines(elements, hasLeftNewline)

      for (let i = 0; i <= elements.length - 2; i++) {
        const currentElement = elements[i]
        const nextElement = elements[i + 1]
        const hasNewLine = currentElement.loc.end.line !== nextElement.loc.start.line

        if (!hasNewLine && needsNewlines) {
          context.report({
            node: currentElement,
            messageId: 'expectedBetween',
            fix: fixer => fixer.insertTextBefore(nextElement, '\n'),
          })
        }
      }
    }

    /**
     * Gets the left paren and right paren tokens of a node.
     * @param {ASTNode} node The node with parens
     * @throws {TypeError} Unexpected node type.
     * @returns {object} An object with keys `leftParen` for the left paren token, and `rightParen` for the right paren token.
     * Can also return `null` if an expression has no parens (e.g. a NewExpression with no arguments, or an ArrowFunctionExpression
     * with a single parameter)
     */
    function getParenTokens(
      node:
      | TSESTree.ArrowFunctionExpression
      | TSESTree.CallExpression
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
      | TSESTree.ImportExpression
      | TSESTree.NewExpression,
    ): ParensPair | null {
      switch (node.type) {
        case 'NewExpression':
          if (!node.arguments.length
                        && !(
                          isOpeningParenToken(sourceCode.getLastToken(node, { skip: 1 })!)
                            && isClosingParenToken(sourceCode.getLastToken(node)!)
                            && node.callee.range[1] < node.range[1]
                        )
          ) {
            // If the NewExpression does not have parens (e.g. `new Foo`), return null.
            return null
          }

          // falls through

        case 'CallExpression':
          return {
            leftParen: sourceCode.getTokenAfter(node.callee, isOpeningParenToken)!,
            rightParen: sourceCode.getLastToken(node)!,
          }

        case 'FunctionDeclaration':
        case 'FunctionExpression': {
          const leftParen = sourceCode.getFirstToken(node, isOpeningParenToken)!
          const rightParen = node.params.length
            ? sourceCode.getTokenAfter(node.params[node.params.length - 1], isClosingParenToken)!
            : sourceCode.getTokenAfter(leftParen)!

          return { leftParen, rightParen }
        }

        case 'ArrowFunctionExpression': {
          const firstToken = sourceCode.getFirstToken(node, { skip: (node.async ? 1 : 0) })!

          if (!isOpeningParenToken(firstToken)) {
            // If the ArrowFunctionExpression has a single param without parens, return null.
            return null
          }

          const rightParen = node.params.length
            ? sourceCode.getTokenAfter(node.params[node.params.length - 1], isClosingParenToken)!
            : sourceCode.getTokenAfter(firstToken)!

          return {
            leftParen: firstToken,
            rightParen,
          }
        }

        case 'ImportExpression': {
          const leftParen = sourceCode.getFirstToken(node, 1)!
          const rightParen = sourceCode.getLastToken(node)!

          return { leftParen, rightParen }
        }

        default:
          throw new TypeError(`unexpected node with type ${node.type}`)
      }
    }

    // ----------------------------------------------------------------------
    // Public
    // ----------------------------------------------------------------------

    return {
      [[
        'ArrowFunctionExpression',
        'CallExpression',
        'FunctionDeclaration',
        'FunctionExpression',
        'ImportExpression',
        'NewExpression',
      ].join(', ')](
        node:
          | TSESTree.ArrowFunctionExpression
          | TSESTree.CallExpression
          | TSESTree.FunctionDeclaration
          | TSESTree.FunctionExpression
          | TSESTree.ImportExpression
          | TSESTree.NewExpression,
      ) {
        const parens = getParenTokens(node)
        let params

        if (node.type === 'ImportExpression')
          params = [node.source]
        else if (isFunction(node))
          params = node.params
        else
          params = node.arguments

        if (parens) {
          validateParens(parens, params)

          if (multilineArgumentsOption)
            validateArguments(parens, params)
        }
      },
    }
  },
})