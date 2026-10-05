import type { Difficulty } from "./types";

export interface CuratedProblem {
  title: string;
  titleSlug: string;
  difficulty: Difficulty;
}

/**
 * Well-known problems per topic (Blind 75 / NeetCode style). Used when LeetCode's problem
 * list can't be reached, and always in demo mode. Order = suggested order within a difficulty.
 */
const p = (title: string, titleSlug: string, difficulty: Difficulty): CuratedProblem => ({ title, titleSlug, difficulty });

export const CURATED: Record<string, CuratedProblem[]> = {
  array: [
    p("Contains Duplicate", "contains-duplicate", "Easy"),
    p("Best Time to Buy and Sell Stock", "best-time-to-buy-and-sell-stock", "Easy"),
    p("Product of Array Except Self", "product-of-array-except-self", "Medium"),
    p("Maximum Subarray", "maximum-subarray", "Medium"),
    p("3Sum", "3sum", "Medium"),
    p("Trapping Rain Water", "trapping-rain-water", "Hard"),
  ],
  string: [
    p("Valid Anagram", "valid-anagram", "Easy"),
    p("Valid Palindrome", "valid-palindrome", "Easy"),
    p("Longest Substring Without Repeating Characters", "longest-substring-without-repeating-characters", "Medium"),
    p("Group Anagrams", "group-anagrams", "Medium"),
    p("Longest Palindromic Substring", "longest-palindromic-substring", "Medium"),
    p("Minimum Window Substring", "minimum-window-substring", "Hard"),
  ],
  "hash-table": [
    p("Two Sum", "two-sum", "Easy"),
    p("Happy Number", "happy-number", "Easy"),
    p("Top K Frequent Elements", "top-k-frequent-elements", "Medium"),
    p("Longest Consecutive Sequence", "longest-consecutive-sequence", "Medium"),
    p("Valid Sudoku", "valid-sudoku", "Medium"),
  ],
  "two-pointers": [
    p("Move Zeroes", "move-zeroes", "Easy"),
    p("Two Sum II - Input Array Is Sorted", "two-sum-ii-input-array-is-sorted", "Medium"),
    p("Container With Most Water", "container-with-most-water", "Medium"),
    p("3Sum", "3sum", "Medium"),
    p("Trapping Rain Water", "trapping-rain-water", "Hard"),
  ],
  "binary-search": [
    p("Binary Search", "binary-search", "Easy"),
    p("Search a 2D Matrix", "search-a-2d-matrix", "Medium"),
    p("Koko Eating Bananas", "koko-eating-bananas", "Medium"),
    p("Find Minimum in Rotated Sorted Array", "find-minimum-in-rotated-sorted-array", "Medium"),
    p("Search in Rotated Sorted Array", "search-in-rotated-sorted-array", "Medium"),
    p("Median of Two Sorted Arrays", "median-of-two-sorted-arrays", "Hard"),
  ],
  "linked-list": [
    p("Reverse Linked List", "reverse-linked-list", "Easy"),
    p("Merge Two Sorted Lists", "merge-two-sorted-lists", "Easy"),
    p("Linked List Cycle", "linked-list-cycle", "Easy"),
    p("Reorder List", "reorder-list", "Medium"),
    p("Remove Nth Node From End of List", "remove-nth-node-from-end-of-list", "Medium"),
    p("Merge k Sorted Lists", "merge-k-sorted-lists", "Hard"),
  ],
  stack: [
    p("Valid Parentheses", "valid-parentheses", "Easy"),
    p("Min Stack", "min-stack", "Medium"),
    p("Daily Temperatures", "daily-temperatures", "Medium"),
    p("Evaluate Reverse Polish Notation", "evaluate-reverse-polish-notation", "Medium"),
    p("Largest Rectangle in Histogram", "largest-rectangle-in-histogram", "Hard"),
  ],
  tree: [
    p("Invert Binary Tree", "invert-binary-tree", "Easy"),
    p("Maximum Depth of Binary Tree", "maximum-depth-of-binary-tree", "Easy"),
    p("Same Tree", "same-tree", "Easy"),
    p("Binary Tree Level Order Traversal", "binary-tree-level-order-traversal", "Medium"),
    p("Validate Binary Search Tree", "validate-binary-search-tree", "Medium"),
    p("Kth Smallest Element in a BST", "kth-smallest-element-in-a-bst", "Medium"),
    p("Binary Tree Maximum Path Sum", "binary-tree-maximum-path-sum", "Hard"),
  ],
  graph: [
    p("Flood Fill", "flood-fill", "Easy"),
    p("Find if Path Exists in Graph", "find-if-path-exists-in-graph", "Easy"),
    p("Number of Islands", "number-of-islands", "Medium"),
    p("Clone Graph", "clone-graph", "Medium"),
    p("Course Schedule", "course-schedule", "Medium"),
    p("Rotting Oranges", "rotting-oranges", "Medium"),
    p("Pacific Atlantic Water Flow", "pacific-atlantic-water-flow", "Medium"),
    p("Word Ladder", "word-ladder", "Hard"),
  ],
  backtracking: [
    p("Subsets", "subsets", "Medium"),
    p("Permutations", "permutations", "Medium"),
    p("Combination Sum", "combination-sum", "Medium"),
    p("Letter Combinations of a Phone Number", "letter-combinations-of-a-phone-number", "Medium"),
    p("Word Search", "word-search", "Medium"),
    p("N-Queens", "n-queens", "Hard"),
  ],
  greedy: [
    p("Assign Cookies", "assign-cookies", "Easy"),
    p("Jump Game", "jump-game", "Medium"),
    p("Jump Game II", "jump-game-ii", "Medium"),
    p("Gas Station", "gas-station", "Medium"),
    p("Partition Labels", "partition-labels", "Medium"),
  ],
  "dynamic-programming": [
    p("Climbing Stairs", "climbing-stairs", "Easy"),
    p("House Robber", "house-robber", "Medium"),
    p("Coin Change", "coin-change", "Medium"),
    p("Longest Increasing Subsequence", "longest-increasing-subsequence", "Medium"),
    p("Word Break", "word-break", "Medium"),
    p("Unique Paths", "unique-paths", "Medium"),
    p("Longest Common Subsequence", "longest-common-subsequence", "Medium"),
    p("Edit Distance", "edit-distance", "Medium"),
    p("Burst Balloons", "burst-balloons", "Hard"),
  ],
};
