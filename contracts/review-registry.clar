(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-RATING u101)
(define-constant ERR-INVALID-COMMENT-LENGTH u102)
(define-constant ERR-INVALID-PURCHASE-TOKEN u103)
(define-constant ERR-INVALID-BUSINESS-ID u104)
(define-constant ERR-REVIEW-ALREADY-EXISTS u105)
(define-constant ERR-REVIEW-NOT-FOUND u106)
(define-constant ERR-INVALID-REVIEW-ID u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-INVALID-HASH u109)
(define-constant ERR-BUSINESS-NOT-REGISTERED u110)
(define-constant ERR-PURCHASE-TOKEN-USED u111)
(define-constant ERR-REVIEWER-MISMATCH u112)
(define-constant ERR-INVALID-PAGINATION u113)
(define-constant ERR-MAX-REVIEWS-EXCEEDED u114)
(define-constant ERR-INVALID-STATUS u115)
(define-data-var review-counter uint u0)
(define-data-var max-reviews-per-business uint u10000)
(define-data-var review-fee uint u10)
(define-data-var authority-contract (optional principal) none)
(define-map reviews
  { review-id: uint }
  {
    purchase-token-id: uint,
    business-id: uint,
    reviewer: principal,
    rating: uint,
    comment: (string-ascii 500),
    timestamp: uint,
    review-hash: (buff 32),
    status: bool
  }
)
(define-map reviews-by-purchase { purchase-token-id: uint } uint)
(define-map reviews-by-business { business-id: uint } { count: uint, average-rating: uint })
(define-map reviews-by-reviewer { reviewer: principal, business-id: uint } uint)
(define-map review-updates
  uint
  {
    updated-rating: uint,
    updated-comment: (string-ascii 500),
    update-timestamp: uint,
    updater: principal
  }
)
(define-read-only (get-review (id uint))
  (map-get? reviews { review-id: id })
)
(define-read-only (get-review-updates (id uint))
  (map-get? review-updates id)
)
(define-read-only (get-reviews-by-business (business-id uint))
  (map-get? reviews-by-business { business-id: business-id })
)
(define-read-only (get-review-by-purchase (purchase-token-id uint))
  (map-get? reviews-by-purchase { purchase-token-id: purchase-token-id })
)
(define-read-only (is-review-exists (id uint))
  (is-some (map-get? reviews { review-id: id }))
)
(define-private (validate-rating (rating uint))
  (if (and (>= rating u1) (<= rating u5))
      (ok true)
      (err ERR-INVALID-RATING))
)
(define-private (validate-comment (comment (string-ascii 500)))
  (if (<= (len comment) u500)
      (ok true)
      (err ERR-INVALID-COMMENT-LENGTH))
)
(define-private (validate-purchase-token (token-id uint) (reviewer principal))
  (match (contract-call? .purchase-token verify-token token-id reviewer)
    success (ok true)
    error (err ERR-INVALID-PURCHASE-TOKEN))
)
(define-private (validate-business (business-id uint))
  (match (contract-call? .business-registry is-valid-business business-id)
    success (ok true)
    error (err ERR-BUSINESS-NOT-REGISTERED))
)
(define-private (validate-review-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-REVIEW-ID))
)
(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)
(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-HASH))
)
(define-private (validate-principal (p principal))
  (if (not (is-eq p tx-sender))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)
(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)
(define-public (set-max-reviews-per-business (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-PAGINATION))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set max-reviews-per-business new-max)
    (ok true)
  )
)
(define-public (set-review-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-RATING))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set review-fee new-fee)
    (ok true)
  )
)
(define-public (submit-review (purchase-token-id uint) (business-id uint) (rating uint) (comment (string-ascii 500)))
  (let
    (
      (review-id (var-get review-counter))
      (reviewer tx-sender)
      (timestamp block-height)
      (review-hash (sha256 (concat (concat (to-consensus-buff? purchase-token-id) (to-consensus-buff? rating)) (to-consensus-buff? comment))))
      (business-reviews (default-to { count: u0, average-rating: u0 } (map-get? reviews-by-business { business-id: business-id })))
      (new-count (+ (get count business-reviews) u1))
      (new-average (/ (+ (* (get average-rating business-reviews) (get count business-reviews)) rating) new-count))
      (authority (var-get authority-contract))
    )
    (asserts! (< (get count business-reviews) (var-get max-reviews-per-business)) (err ERR-MAX-REVIEWS-EXCEEDED))
    (try! (validate-rating rating))
    (try! (validate-comment comment))
    (try! (validate-purchase-token purchase-token-id reviewer))
    (try! (validate-business business-id))
    (try! (validate-timestamp timestamp))
    (try! (validate-hash review-hash))
    (asserts! (is-none (map-get? reviews-by-purchase { purchase-token-id: purchase-token-id })) (err ERR-PURCHASE-TOKEN-USED))
    (asserts! (is-none (map-get? reviews-by-reviewer { reviewer: reviewer, business-id: business-id })) (err ERR-REVIEW-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-NOT-AUTHORIZED))))
      (try! (stx-transfer? (var-get review-fee) tx-sender authority-recipient))
    )
    (map-set reviews { review-id: review-id }
      {
        purchase-token-id: purchase-token-id,
        business-id: business-id,
        reviewer: reviewer,
        rating: rating,
        comment: comment,
        timestamp: timestamp,
        review-hash: review-hash,
        status: true
      }
    )
    (map-set reviews-by-purchase { purchase-token-id: purchase-token-id } review-id)
    (map-set reviews-by-reviewer { reviewer: reviewer, business-id: business-id } review-id)
    (map-set reviews-by-business { business-id: business-id } { count: new-count, average-rating: new-average })
    (var-set review-counter (+ review-id u1))
    (print { event: "review-submitted", id: review-id })
    (ok review-id)
  )
)
(define-public (update-review (review-id uint) (new-rating uint) (new-comment (string-ascii 500)))
  (let ((review (map-get? reviews { review-id: review-id })))
    (match review
      r
        (begin
          (asserts! (is-eq (get reviewer r) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (get status r) (err ERR-INVALID-STATUS))
          (try! (validate-rating new-rating))
          (try! (validate-comment new-comment))
          (let
            (
              (business-id (get business-id r))
              (old-rating (get rating r))
              (business-reviews (unwrap! (map-get? reviews-by-business { business-id: business-id }) (err ERR-BUSINESS-NOT-REGISTERED)))
              (count (get count business-reviews))
              (new-average (/ (+ (- (* (get average-rating business-reviews) count) old-rating) new-rating) count))
            )
            (map-set reviews { review-id: review-id }
              (merge r { rating: new-rating, comment: new-comment, timestamp: block-height })
            )
            (map-set reviews-by-business { business-id: business-id } { count: count, average-rating: new-average })
          )
          (map-set review-updates review-id
            {
              updated-rating: new-rating,
              updated-comment: new-comment,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "review-updated", id: review-id })
          (ok true)
        )
      (err ERR-REVIEW-NOT-FOUND)
    )
  )
)
(define-public (get-review-count)
  (ok (var-get review-counter))
)
(define-public (check-review-existence (purchase-token-id uint))
  (ok (is-some (map-get? reviews-by-purchase { purchase-token-id: purchase-token-id })))
)