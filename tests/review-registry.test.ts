import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_RATING = 101;
const ERR_INVALID_COMMENT_LENGTH = 102;
const ERR_INVALID_PURCHASE_TOKEN = 103;
const ERR_BUSINESS_NOT_REGISTERED = 110;
const ERR_PURCHASE_TOKEN_USED = 111;
const ERR_REVIEW_ALREADY_EXISTS = 105;
const ERR_REVIEW_NOT_FOUND = 106;
const ERR_MAX_REVIEWS_EXCEEDED = 114;
const ERR_INVALID_STATUS = 115;

interface Review {
  purchaseTokenId: number;
  businessId: number;
  reviewer: string;
  rating: number;
  comment: string;
  timestamp: number;
  reviewHash: Uint8Array;
  status: boolean;
}

interface BusinessReviews {
  count: number;
  averageRating: number;
}

interface ReviewUpdate {
  updatedRating: number;
  updatedComment: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ReviewRegistryMock {
  state: {
    reviewCounter: number;
    maxReviewsPerBusiness: number;
    reviewFee: number;
    authorityContract: string | null;
    reviews: Map<number, Review>;
    reviewsByPurchase: Map<number, number>;
    reviewsByBusiness: Map<number, BusinessReviews>;
    reviewsByReviewer: Map<string, Map<number, number>>;
    reviewUpdates: Map<number, ReviewUpdate>;
  } = this.resetState();
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];
  purchaseTokens: Map<number, { owner: string; valid: boolean }> = new Map();
  businesses: Set<number> = new Set();

  private resetState() {
    return {
      reviewCounter: 0,
      maxReviewsPerBusiness: 10000,
      reviewFee: 10,
      authorityContract: null,
      reviews: new Map(),
      reviewsByPurchase: new Map(),
      reviewsByBusiness: new Map(),
      reviewsByReviewer: new Map(),
      reviewUpdates: new Map(),
    };
  }

  reset() {
    this.state = this.resetState();
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
    this.purchaseTokens = new Map();
    this.businesses = new Set();
  }

  mockPurchaseToken(tokenId: number, owner: string, valid: boolean) {
    this.purchaseTokens.set(tokenId, { owner, valid });
  }

  mockBusiness(businessId: number) {
    this.businesses.add(businessId);
  }

  verifyToken(tokenId: number, reviewer: string): Result<boolean> {
    const token = this.purchaseTokens.get(tokenId);
    if (!token || !token.valid || token.owner !== reviewer) {
      return { ok: false, value: ERR_INVALID_PURCHASE_TOKEN };
    }
    return { ok: true, value: true };
  }

  isValidBusiness(businessId: number): Result<boolean> {
    if (!this.businesses.has(businessId)) {
      return { ok: false, value: ERR_BUSINESS_NOT_REGISTERED };
    }
    return { ok: true, value: true };
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== "ST1TEST") return { ok: false, value: false };
    if (this.state.authorityContract !== null) return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setReviewFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.reviewFee = newFee;
    return { ok: true, value: true };
  }

  submitReview(purchaseTokenId: number, businessId: number, rating: number, comment: string): Result<number> {
    const businessReviews = this.state.reviewsByBusiness.get(businessId) || { count: 0, averageRating: 0 };
    if (businessReviews.count >= this.state.maxReviewsPerBusiness) return { ok: false, value: ERR_MAX_REVIEWS_EXCEEDED };
    if (rating < 1 || rating > 5) return { ok: false, value: ERR_INVALID_RATING };
    if (comment.length > 500) return { ok: false, value: ERR_INVALID_COMMENT_LENGTH };
    if (!this.verifyToken(purchaseTokenId, this.caller).ok) return { ok: false, value: ERR_INVALID_PURCHASE_TOKEN };
    if (!this.isValidBusiness(businessId).ok) return { ok: false, value: ERR_BUSINESS_NOT_REGISTERED };
    if (this.state.reviewsByPurchase.has(purchaseTokenId)) return { ok: false, value: ERR_PURCHASE_TOKEN_USED };
    const reviewerMap = this.state.reviewsByReviewer.get(this.caller) || new Map<number, number>();
    if (reviewerMap.has(businessId)) return { ok: false, value: ERR_REVIEW_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.stxTransfers.push({ amount: this.state.reviewFee, from: this.caller, to: this.state.authorityContract });
    const id = this.state.reviewCounter;
    const reviewHash = new Uint8Array(32); // Mock hash
    const review: Review = {
      purchaseTokenId,
      businessId,
      reviewer: this.caller,
      rating,
      comment,
      timestamp: this.blockHeight,
      reviewHash,
      status: true,
    };
    this.state.reviews.set(id, review);
    this.state.reviewsByPurchase.set(purchaseTokenId, id);
    reviewerMap.set(businessId, id);
    this.state.reviewsByReviewer.set(this.caller, reviewerMap);
    const newCount = businessReviews.count + 1;
    const newAverage = Math.floor(((businessReviews.averageRating * businessReviews.count) + rating) / newCount);
    this.state.reviewsByBusiness.set(businessId, { count: newCount, averageRating: newAverage });
    this.state.reviewCounter++;
    return { ok: true, value: id };
  }

  getReview(id: number): Review | null {
    return this.state.reviews.get(id) || null;
  }

  updateReview(id: number, newRating: number, newComment: string): Result<boolean> {
    const review = this.state.reviews.get(id);
    if (!review) return { ok: false, value: ERR_REVIEW_NOT_FOUND };
    if (review.reviewer !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!review.status) return { ok: false, value: ERR_INVALID_STATUS };
    if (newRating < 1 || newRating > 5) return { ok: false, value: ERR_INVALID_RATING };
    if (newComment.length > 500) return { ok: false, value: ERR_INVALID_COMMENT_LENGTH };
    const businessId = review.businessId;
    const businessReviews = this.state.reviewsByBusiness.get(businessId)!;
    const oldRating = review.rating;
    const count = businessReviews.count;
    const newAverage = Math.floor(((businessReviews.averageRating * count) - oldRating + newRating) / count);
    const updated: Review = {
      ...review,
      rating: newRating,
      comment: newComment,
      timestamp: this.blockHeight,
    };
    this.state.reviews.set(id, updated);
    this.state.reviewsByBusiness.set(businessId, { count, averageRating: newAverage });
    this.state.reviewUpdates.set(id, {
      updatedRating: newRating,
      updatedComment: newComment,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getReviewCount(): Result<number> {
    return { ok: true, value: this.state.reviewCounter };
  }

  checkReviewExistence(purchaseTokenId: number): Result<boolean> {
    return { ok: true, value: this.state.reviewsByPurchase.has(purchaseTokenId) };
  }
}

describe("ReviewRegistry", () => {
  let contract: ReviewRegistryMock;
  beforeEach(() => {
    contract = new ReviewRegistryMock();
    contract.reset();
  });
  it("submits a review successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mockPurchaseToken(1, "ST1TEST", true);
    contract.mockBusiness(1);
    const result = contract.submitReview(1, 1, 4, "Great service");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const review = contract.getReview(0);
    expect(review?.rating).toBe(4);
    expect(review?.comment).toBe("Great service");
    expect(contract.stxTransfers).toEqual([{ amount: 10, from: "ST1TEST", to: "ST2TEST" }]);
  });
  it("rejects duplicate review for same purchase", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mockPurchaseToken(1, "ST1TEST", true);
    contract.mockBusiness(1);
    contract.submitReview(1, 1, 4, "Great service");
    const result = contract.submitReview(1, 1, 5, "Updated");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PURCHASE_TOKEN_USED);
  });
  it("rejects invalid rating", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mockPurchaseToken(1, "ST1TEST", true);
    contract.mockBusiness(1);
    const result = contract.submitReview(1, 1, 6, "Invalid");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RATING);
  });
  it("updates a review successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mockPurchaseToken(1, "ST1TEST", true);
    contract.mockBusiness(1);
    contract.submitReview(1, 1, 4, "Great service");
    const result = contract.updateReview(0, 5, "Excellent");
    expect(result.ok).toBe(true);
    const review = contract.getReview(0);
    expect(review?.rating).toBe(5);
    expect(review?.comment).toBe("Excellent");
  });
  it("rejects update by non-reviewer", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mockPurchaseToken(1, "ST1TEST", true);
    contract.mockBusiness(1);
    contract.submitReview(1, 1, 4, "Great service");
    contract.caller = "ST3FAKE";
    const result = contract.updateReview(0, 5, "Excellent");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });
  it("checks review existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mockPurchaseToken(1, "ST1TEST", true);
    contract.mockBusiness(1);
    contract.submitReview(1, 1, 4, "Great service");
    const result = contract.checkReviewExistence(1);
    expect(result.value).toBe(true);
    const result2 = contract.checkReviewExistence(2);
    expect(result2.value).toBe(false);
  });
  it("parses review parameters with Clarity types", () => {
    const comment = stringAsciiCV("Test comment");
    const rating = uintCV(4);
    expect(comment.value).toBe("Test comment");
    expect(rating.value).toEqual(BigInt(4));
  });
  it("rejects submission without authority", () => {
    contract.mockPurchaseToken(1, "ST1TEST", true);
    contract.mockBusiness(1);
    const result = contract.submitReview(1, 1, 4, "Great service");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });
  it("rejects max reviews exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxReviewsPerBusiness = 1;
    contract.mockPurchaseToken(1, "ST1TEST", true);
    contract.mockBusiness(1);
    contract.submitReview(1, 1, 4, "Great service");
    contract.mockPurchaseToken(2, "ST1TEST", true);
    const result = contract.submitReview(2, 1, 5, "Excellent");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_REVIEWS_EXCEEDED);
  });
  it("sets review fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setReviewFee(20);
    expect(contract.state.reviewFee).toBe(20);
    contract.mockPurchaseToken(1, "ST1TEST", true);
    contract.mockBusiness(1);
    contract.submitReview(1, 1, 4, "Great service");
    expect(contract.stxTransfers).toEqual([{ amount: 20, from: "ST1TEST", to: "ST2TEST" }]);
  });
});