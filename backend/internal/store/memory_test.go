package store

import (
	"errors"
	"testing"

	"splitthebill/backend/internal/domain"
)

func TestMemoryStoreCollaborationFlow(t *testing.T) {
	appStore := NewMemoryStore()

	room, err := appStore.CreateRoom(domain.Room{
		Title:    "Dinner",
		Currency: "EUR",
	})
	if err != nil {
		t.Fatal(err)
	}

	if room.AdminToken == "" {
		t.Fatal("expected admin token")
	}

	participant, err := appStore.AddParticipant(
		room.ID,
		domain.Participant{Name: "Аня"},
	)
	if err != nil {
		t.Fatal(err)
	}

	if participant.Claimed {
		t.Fatal("organizer-created participant must be unclaimed")
	}

	joined, err := appStore.JoinParticipant(room.ID, "аня")
	if err != nil {
		t.Fatal(err)
	}

	if !joined.Claimed || joined.AccessToken == "" {
		t.Fatal("joined participant must receive a token")
	}

	if joined.ID != participant.ID {
		t.Fatalf("expected existing participant %s to be claimed, got %s", participant.ID, joined.ID)
	}

	_, err = appStore.JoinParticipant(room.ID, "Аня")
	if !errors.Is(err, ErrorNameTaken) {
		t.Fatalf("expected ErrorNameTaken, got %v", err)
	}

	found, err := appStore.FindParticipantByToken(room.ID, joined.AccessToken)
	if err != nil {
		t.Fatal(err)
	}
	if found.ID != joined.ID {
		t.Fatalf("expected participant %s, got %s", joined.ID, found.ID)
	}

	item, err := appStore.AddItem(room.ID, domain.ReceiptItem{
		Name:      "Pizza",
		Quantity:  1,
		UnitPrice: 1000,
		Total:     1000,
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = appStore.AddAssignment(room.ID, domain.ItemAssignment{
		ItemID:        item.ID,
		ParticipantID: joined.ID,
		Weight:        1,
	})
	if err != nil {
		t.Fatal(err)
	}

	room.PayerParticipantID = joined.ID
	if _, err := appStore.UpdateRoom(room); err != nil {
		t.Fatal(err)
	}

	if err := appStore.DeleteParticipant(room.ID, joined.ID); err != nil {
		t.Fatal(err)
	}

	updatedRoom, err := appStore.GetRoom(room.ID)
	if err != nil {
		t.Fatal(err)
	}
	if updatedRoom.PayerParticipantID != "" {
		t.Fatal("payer must be cleared when participant is deleted")
	}

	assignments, err := appStore.ListAssignments(room.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(assignments) != 0 {
		t.Fatalf("participant deletion must cascade assignments, got %#v", assignments)
	}
}
