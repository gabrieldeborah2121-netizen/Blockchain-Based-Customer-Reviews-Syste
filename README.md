# 🌟 Blockchain-Based Customer Reviews System

Welcome to a decentralized solution for trustworthy customer reviews! This project uses the Stacks blockchain and Clarity smart contracts to prevent fake ratings, ensuring authentic and transparent feedback for businesses, products, or services.

## ✨ Features
- 🔒 **Immutable Reviews**: Reviews are stored on-chain, preventing tampering or deletion.
- 🛡️ **Verified Reviewers**: Only verified customers (e.g., those with a purchase) can submit reviews.
- ⭐ **Rating System**: Submit ratings (1-5 stars) with optional comments.
- 🚫 **Prevent Fake Reviews**: Cryptographic checks ensure reviews are tied to real transactions.
- 📊 **Transparent Analytics**: Businesses and users can access aggregated review data.
- 🕵️ **Moderation System**: Flag inappropriate reviews while maintaining immutability.
- 🔐 **User Privacy**: Reviewers can remain pseudonymous with Stacks identities.
- ✅ **Verification of Authenticity**: Anyone can verify the legitimacy of a review.

## 🛠 How It Works

### For Customers
1. **Purchase Verification**: After a purchase, a business issues a purchase token (NFT) to the customer.
2. **Submit Review**: Use the `submit-review` contract to post a rating (1-5) and optional comment, linked to the purchase token.
3. **Earn Rewards**: Optionally, reviewers can earn small tokens for submitting reviews (incentivizing participation).
4. **Flag Inappropriate Reviews**: Users can flag reviews for moderation, but the original review remains on-chain.

### For Businesses
1. **Register Business**: Businesses register their profile using the `business-registry` contract.
2. **Issue Purchase Tokens**: After a sale, businesses mint purchase tokens via the `purchase-token` contract.
3. **View Analytics**: Use the `review-analytics` contract to access average ratings and review counts.
4. **Respond to Reviews**: Businesses can post responses to reviews using the `review-response` contract.

### For Verifiers
1. **Check Review Authenticity**: Use the `verify-review` contract to confirm a review is tied to a valid purchase.
2. **View Review Details**: Access review details (rating, comment, timestamp) via the `review-registry` contract.
`

### Usage
1. **Register a Business**:
   - Call `(register-business (name (string-ascii 50)) (metadata (string-ascii 200)))` in `business-registry.clar`.
2. **Issue a Purchase Token**:
   - After a sale, call `(mint-purchase-token (customer principal) (business-id uint))` in `purchase-token.clar`.
3. **Submit a Review**:
   - Customers call `(submit-review (purchase-token-id uint) (rating uint) (comment (string-ascii 500)))` in `review-registry.clar`.
4. **Verify a Review**:
   - Use `(verify-review (review-id uint))` in `review-verification.clar` to confirm authenticity.
5. **View Analytics**:
   - Call `(get-average-rating (business-id uint))` in `review-analytics.clar` for insights.
