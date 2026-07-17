package domain

type Room struct {
	ID                 string `json:"id"`
	Title              string `json:"title"`
	Currency           string `json:"currency"`
	ServiceFee         int64  `json:"service_fee"`
	TipAmount          int64  `json:"tip_amount"`
	Discount           int64  `json:"discount"`
	ExpectedTotal      int64  `json:"expected_total"`
	PayerParticipantID string `json:"payer_participant_id"`
	AdminToken         string `json:"-"`
}

type Participant struct {
	ID          string `json:"id"`
	RoomID      string `json:"room_id"`
	Name        string `json:"name"`
	Claimed     bool   `json:"claimed"`
	AccessToken string `json:"-"`
}

type ReceiptItem struct {
	ID        string `json:"id"`
	RoomID    string `json:"room_id"`
	Name      string `json:"name"`
	Quantity  int    `json:"quantity"`
	UnitPrice int64  `json:"unit_price"`
	Total     int64  `json:"total"`
}

type ItemAssignment struct {
	ItemID        string `json:"item_id"`
	ParticipantID string `json:"participant_id"`
	Weight        int64  `json:"weight"`
}

type ParticipantResult struct {
	ParticipantID string `json:"participant_id"`
	Name          string `json:"name"`
	BaseAmount    int64  `json:"base_amount"`
	ServiceShare  int64  `json:"service_share"`
	TipShare      int64  `json:"tip_share"`
	DiscountShare int64  `json:"discount_share"`
	TotalAmount   int64  `json:"total_amount"`
}
