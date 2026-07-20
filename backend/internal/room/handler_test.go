package room

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"splitthebill/backend/internal/domain"
	"splitthebill/backend/internal/store"
)

type createRoomResponse struct {
	Room       domain.Room `json:"room"`
	AdminToken string      `json:"admin_token"`
}

type joinResponse struct {
	Participant      domain.Participant `json:"participant"`
	ParticipantToken string             `json:"participant_token"`
}

func TestCollaborativeRoomFlow(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	handler := NewHandler(memoryStore)

	created := doJSON[createRoomResponse](
		t,
		handler,
		http.MethodPost,
		"/rooms",
		map[string]any{
			"title":          "Dinner",
			"currency":       "EUR",
			"expected_total": 1000,
		},
		nil,
		http.StatusCreated,
	)

	if created.AdminToken == "" {
		t.Fatal("expected admin token")
	}

	doJSON[map[string]string](
		t,
		handler,
		http.MethodPost,
		"/rooms/"+created.Room.ID+"/participants",
		map[string]any{"name": "Аня"},
		nil,
		http.StatusForbidden,
	)

	participant := doJSON[domain.Participant](
		t,
		handler,
		http.MethodPost,
		"/rooms/"+created.Room.ID+"/participants",
		map[string]any{"name": "Аня"},
		map[string]string{"X-Admin-Token": created.AdminToken},
		http.StatusCreated,
	)

	joined := doJSON[joinResponse](
		t,
		handler,
		http.MethodPost,
		"/rooms/"+created.Room.ID+"/join",
		map[string]any{"name": "аня"},
		nil,
		http.StatusCreated,
	)

	if joined.Participant.ID != participant.ID || joined.ParticipantToken == "" {
		t.Fatalf("unexpected join response: %#v", joined)
	}

	item := doJSON[domain.ReceiptItem](
		t,
		handler,
		http.MethodPost,
		"/rooms/"+created.Room.ID+"/items",
		map[string]any{
			"name":       "Pizza",
			"quantity":   1,
			"unit_price": 1000,
		},
		map[string]string{"X-Admin-Token": created.AdminToken},
		http.StatusCreated,
	)

	selection := doJSON[domain.ItemAssignment](
		t,
		handler,
		http.MethodPut,
		"/rooms/"+created.Room.ID+"/selections/"+item.ID,
		nil,
		map[string]string{"X-Participant-Token": joined.ParticipantToken},
		http.StatusOK,
	)

	if selection.ParticipantID != participant.ID || selection.ItemID != item.ID {
		t.Fatalf("unexpected selection: %#v", selection)
	}

	updatedRoom := doJSON[domain.Room](
		t,
		handler,
		http.MethodPatch,
		"/rooms/"+created.Room.ID,
		map[string]any{"payer_participant_id": participant.ID},
		map[string]string{"X-Admin-Token": created.AdminToken},
		http.StatusOK,
	)

	if updatedRoom.PayerParticipantID != participant.ID {
		t.Fatalf("expected payer %s, got %s", participant.ID, updatedRoom.PayerParticipantID)
	}

	calculation := doJSON[struct {
		CalculatedTotal      int64 `json:"calculated_total"`
		Difference           int64 `json:"difference"`
		MatchesExpectedTotal bool  `json:"matches_expected_total"`
	}](
		t,
		handler,
		http.MethodPost,
		"/rooms/"+created.Room.ID+"/calculate",
		nil,
		nil,
		http.StatusOK,
	)

	if calculation.CalculatedTotal != 1000 || calculation.Difference != 0 || !calculation.MatchesExpectedTotal {
		t.Fatalf("unexpected calculation: %#v", calculation)
	}

	doNoContent(
		t,
		handler,
		http.MethodDelete,
		"/rooms/"+created.Room.ID+"/selections/"+item.ID,
		map[string]string{"X-Participant-Token": joined.ParticipantToken},
	)
}

func TestParticipantCanOnlyUseValidSession(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	handler := NewHandler(memoryStore)

	room, _ := memoryStore.CreateRoom(domain.Room{Title: "Dinner", Currency: "EUR"})
	item, _ := memoryStore.AddItem(room.ID, domain.ReceiptItem{
		Name: "Pizza", Quantity: 1, UnitPrice: 1000, Total: 1000,
	})

	doJSON[map[string]string](
		t,
		handler,
		http.MethodPut,
		"/rooms/"+room.ID+"/selections/"+item.ID,
		nil,
		map[string]string{"X-Participant-Token": "invalid"},
		http.StatusUnauthorized,
	)
}

func doNoContent(
	t *testing.T,
	handler http.Handler,
	method string,
	path string,
	headers map[string]string,
) {
	t.Helper()

	req := httptest.NewRequest(method, path, nil)
	for name, value := range headers {
		req.Header.Set(name, value)
	}

	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusNoContent {
		t.Fatalf("%s %s: expected status %d, got %d: %s", method, path, http.StatusNoContent, res.Code, res.Body.String())
	}
}

func doJSON[T any](
	t *testing.T,
	handler http.Handler,
	method string,
	path string,
	body any,
	headers map[string]string,
	expectedStatus int,
) T {
	t.Helper()

	var requestBody *bytes.Reader
	if body == nil {
		requestBody = bytes.NewReader(nil)
	} else {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		requestBody = bytes.NewReader(data)
	}

	req := httptest.NewRequest(method, path, requestBody)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for name, value := range headers {
		req.Header.Set(name, value)
	}

	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != expectedStatus {
		t.Fatalf("%s %s: expected status %d, got %d: %s", method, path, expectedStatus, res.Code, res.Body.String())
	}

	var result T
	if res.Body.Len() == 0 {
		return result
	}

	if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode response: %v; body=%s", err, res.Body.String())
	}

	return result
}
