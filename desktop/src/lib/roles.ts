import { publicKeyFromDid } from "@app/lib/utils";

export function isDelegate(
  publicKey: string | undefined,
  delegates: string[],
): true | undefined {
  if (!publicKey) {
    return undefined;
  }
  return (
    delegates.some(delegate => publicKeyFromDid(delegate) === publicKey) ||
    undefined
  );
}

export function isDelegateOrAuthor(
  publicKey: string | undefined,
  delegates: string[],
  author: string,
): true | undefined {
  return (
    isDelegate(publicKey, delegates) ||
    publicKey === publicKeyFromDid(author) ||
    undefined
  );
}

/// The protocol lets the comment author, the review author or the revision
/// author resolve a review comment; delegates may do anything.
export function canResolveReviewComment(
  publicKey: string,
  delegates: string[],
  authors: {
    comment: string | undefined;
    review: string | undefined;
    revision: string | undefined;
  },
): boolean {
  if (isDelegate(publicKey, delegates)) return true;
  return [authors.comment, authors.review, authors.revision].some(
    did => did !== undefined && publicKeyFromDid(did) === publicKey,
  );
}
